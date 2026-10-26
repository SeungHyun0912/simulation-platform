import { ApiError, NetworkError, type ApiErrorDetail } from "./errors";

/**
 * 모든 API 호출이 지나는 공통 계층. 화면은 fetch를 직접 쓰지 않는다.
 * - 인증 정보를 코드·URL·로그에 두지 않는다. 로컬 개발은 Vite proxy가 헤더를 붙인다(vite.config.ts).
 * - 응답은 `{data}`/`{data, page}` 래퍼를 그대로 돌려주고, ETag(row_version)와 X-Request-ID를 함께 준다.
 * - 수정 요청의 If-Match는 호출한 쪽이 row_version 정수로 넘기고 이 계층이 `"n"` 형식으로 붙인다.
 */
export type QueryValue = string | number | boolean | null | undefined;

export type RequestOptions = {
  query?: Record<string, QueryValue>;
  body?: unknown;
  /** 수정(PATCH)·전이(POST) 요청의 row_version. 누락하면 서버가 428을 준다. */
  ifMatch?: number;
  signal?: AbortSignal;
};

export type ApiResult<B> = {
  body: B;
  status: number;
  /** ETag 헤더를 정수로 바꾼 값(row_version). 없으면 null */
  version: number | null;
  requestId: string | null;
  /** 생성(201) 응답의 Location */
  location: string | null;
};

export type ApiClientConfig = {
  baseUrl?: string;
  /** 테스트·Mock에서 주입한다. 기본은 전역 fetch */
  fetchImpl?: typeof fetch;
};

const DEFAULT_BASE = (import.meta.env?.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";

/** ETag 헤더(`"2"`, `W/"2"`)를 정수로 바꾼다. 정수가 아니면 null(임의 값을 만들지 않는다). */
export function parseEtag(header: string | null): number | null {
  if (!header) return null;
  const m = /^(?:W\/)?"(\d+)"$/.exec(header.trim());
  return m ? Number(m[1]) : null;
}

export function buildQuery(query: Record<string, QueryValue> | undefined): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue; // 빈 값은 보내지 않는다(빈 문자열은 null이 아님)
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

function isErrorEnvelope(x: unknown): x is { error: { code?: unknown; message?: unknown; request_id?: unknown; details?: unknown } } {
  return typeof x === "object" && x !== null && "error" in x && typeof (x as { error: unknown }).error === "object" && (x as { error: unknown }).error !== null;
}

export function createApiClient(config: ApiClientConfig = {}) {
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, "");

  async function request<B>(method: string, path: string, opts: RequestOptions = {}): Promise<ApiResult<B>> {
    const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}${buildQuery(opts.query)}`;
    const headers: Record<string, string> = { Accept: "application/json" };
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    if (opts.ifMatch !== undefined) headers["If-Match"] = `"${opts.ifMatch}"`;

    let res: Response;
    try {
      res = await (config.fetchImpl ?? fetch)(url, { method, headers, body, signal: opts.signal });
    } catch (e) {
      // 취소는 오류가 아니므로 그대로 다시 던진다(TanStack Query가 취소로 처리).
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      throw new NetworkError();
    }

    const requestId = res.headers.get("X-Request-ID");
    const text = await res.text();
    let parsed: unknown = undefined;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined; // JSON이 아닌 본문(프록시 오류 등)
      }
    }

    if (!res.ok) {
      if (isErrorEnvelope(parsed)) {
        const e = parsed.error;
        throw new ApiError({
          status: res.status,
          code: typeof e.code === "string" ? e.code : "HTTP_ERROR",
          message: typeof e.message === "string" ? e.message : `요청이 실패했습니다(${res.status}).`,
          requestId: typeof e.request_id === "string" ? e.request_id : requestId,
          details: Array.isArray(e.details) ? (e.details as ApiErrorDetail[]) : [],
        });
      }
      throw new ApiError({
        status: res.status,
        code: "HTTP_ERROR",
        message: `요청이 실패했습니다(${res.status}).`,
        requestId,
      });
    }

    return {
      body: parsed as B,
      status: res.status,
      version: parseEtag(res.headers.get("ETag")),
      requestId,
      location: res.headers.get("Location"),
    };
  }

  return {
    get: <B>(path: string, opts?: Omit<RequestOptions, "body" | "ifMatch">) => request<B>("GET", path, opts),
    post: <B>(path: string, opts?: RequestOptions) => request<B>("POST", path, opts),
    patch: <B>(path: string, opts?: RequestOptions) => request<B>("PATCH", path, opts),
    put: <B>(path: string, opts?: RequestOptions) => request<B>("PUT", path, opts),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** 앱 전체가 쓰는 기본 클라이언트. 테스트는 `createApiClient({fetchImpl})`를 직접 만든다. */
export const api: ApiClient = createApiClient();
