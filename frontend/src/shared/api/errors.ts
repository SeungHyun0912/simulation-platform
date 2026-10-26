import type { ValidationIssue } from "../components/ValidationPanel";

/** 오류 envelope의 details 항목(계약 04 §2). */
export type ApiErrorDetail = {
  message: string;
  severity?: string;
  rule_id?: string | null;
  entity_id?: string | null;
  field_path?: string | null;
  resolution?: string | null;
};

/** 서버가 `{error: {...}}` envelope 또는 HTTP 오류로 응답한 경우. */
export class ApiError extends Error {
  readonly status: number;
  /** 계약의 error.code. envelope이 아니면 `HTTP_ERROR`. */
  readonly code: string;
  readonly requestId: string | null;
  readonly details: ApiErrorDetail[];

  constructor(init: {
    status: number;
    code: string;
    message: string;
    requestId?: string | null;
    details?: ApiErrorDetail[];
  }) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.requestId = init.requestId ?? null;
    this.details = init.details ?? [];
  }
}

/** 서버에 닿지 못한 경우(연결 거부, DNS, 네트워크 단절). 요청이 처리되었는지 알 수 없다. */
export class NetworkError extends Error {
  constructor(message = "서버에 연결하지 못했습니다.") {
    super(message);
    this.name = "NetworkError";
  }
}

/**
 * 화면이 구분해서 보여 주는 오류 종류. 모르는 code는 `unknown`으로 두고 일반 오류로 표시한다.
 * - precondition(428)은 FE의 If-Match 누락이라는 버그 신호이므로 사용자에게 그대로 노출하지 않는다.
 */
export type ErrorKind =
  | "unauthenticated"
  | "forbidden"
  | "not-found"
  | "conflict" // 412 EDIT_CONFLICT
  | "state" // 409 VERSION_IMMUTABLE / REVISION_DRAFT_EXISTS / INVALID_STATE_TRANSITION
  | "duplicate" // 409 *_CODE_CONFLICT
  | "validation" // 422
  | "precondition" // 428
  | "server"
  | "network"
  | "unknown";

export function classifyError(e: unknown): ErrorKind {
  if (e instanceof NetworkError) return "network";
  if (!(e instanceof ApiError)) return "unknown";
  switch (e.code) {
    case "UNAUTHENTICATED":
      return "unauthenticated";
    case "FORBIDDEN":
      return "forbidden";
    case "NOT_FOUND":
      return "not-found";
    case "EDIT_CONFLICT":
      return "conflict";
    case "VERSION_IMMUTABLE":
    case "REVISION_DRAFT_EXISTS":
    case "PROCESS_DRAFT_EXISTS":
    case "INVALID_STATE_TRANSITION":
      return "state";
    case "PROJECT_CODE_CONFLICT":
    case "ASSET_CODE_CONFLICT":
    case "PRODUCT_CODE_CONFLICT":
    case "MATERIAL_CODE_CONFLICT":
      return "duplicate";
    case "VALIDATION_ERROR":
    case "INVALID_CURSOR":
      return "validation";
    case "PRECONDITION_REQUIRED":
      return "precondition";
    case "INTERNAL_ERROR":
      return "server";
  }
  if (e.status === 401) return "unauthenticated";
  if (e.status === 403) return "forbidden";
  if (e.status === 404) return "not-found";
  if (e.status === 412) return "conflict";
  if (e.status === 422) return "validation";
  if (e.status >= 500) return "server";
  return "unknown";
}

/** 오류 details를 검증 패널 항목으로 바꾼다. field_path는 본문 기준 JSON Pointer 그대로 둔다. */
export function toIssues(e: ApiError): ValidationIssue[] {
  return e.details.map((d) => ({
    severity: d.severity === "warning" ? "warning" : "error",
    message: d.message,
    ...(d.rule_id ? { rule_id: d.rule_id } : {}),
    ...(d.entity_id ? { entity_id: d.entity_id } : {}),
    ...(d.field_path ? { field_path: d.field_path } : {}),
    ...(d.resolution ? { resolution: d.resolution } : {}),
  }));
}

/**
 * field_path(JSON Pointer) → 첫 오류 메시지. 폼 필드에 매핑할 때 쓴다.
 * 쿼리·헤더 오류도 같은 모양(`/limit`)이라 본문 필드와 겹칠 수 있으므로 호출한 endpoint 문맥에서만 쓴다.
 */
export function fieldErrors(e: ApiError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of e.details) {
    if (d.field_path && !(d.field_path in out)) out[d.field_path] = d.message;
  }
  return out;
}
