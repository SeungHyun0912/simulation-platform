import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildQuery, createApiClient, parseEtag } from "../../src/shared/api/client";
import {
  ApiError,
  classifyError,
  fieldErrors,
  NetworkError,
  toIssues,
} from "../../src/shared/api/errors";
import contractMeta from "../../src/shared/api/generated/CONTRACT.json";

type Call = { url: string; init: RequestInit };

function fakeFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    const call = { url, init };
    calls.push(call);
    return respond(call);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

describe("생성된 타입과 승인 계약", () => {
  it("생성물의 계약 version·hash가 contract-status.json과 같다(오래된 client 방지)", () => {
    const status = JSON.parse(
      readFileSync(resolve(__dirname, "../../../contracts/contract-status.json"), "utf8"),
    );
    expect(contractMeta.contract_version).toBe(status.contract_version);
    expect(contractMeta.openapi_sha256).toBe(status.openapi_sha256);
    expect(contractMeta.approved_scopes).toEqual(status.approved_scopes);
  });
});

describe("parseEtag·buildQuery", () => {
  it("ETag를 정수로 바꾸고 모르는 형식은 null이다", () => {
    expect(parseEtag('"2"')).toBe(2);
    expect(parseEtag('W/"17"')).toBe(17);
    expect(parseEtag("2")).toBeNull();
    expect(parseEtag('"abc"')).toBeNull();
    expect(parseEtag(null)).toBeNull();
  });
  it("빈 값(undefined·null·빈 문자열)은 쿼리에 넣지 않고 0·false는 보낸다", () => {
    expect(buildQuery({ q: "", kind: undefined, cursor: null, limit: 0, include_archived: false })).toBe(
      "?limit=0&include_archived=false",
    );
    expect(buildQuery(undefined)).toBe("");
    expect(buildQuery({ q: "가 나" })).toBe("?q=%EA%B0%80+%EB%82%98");
  });
});

describe("요청", () => {
  it("기본 헤더와 base URL을 쓰고 인증 헤더·쿠키를 코드에서 붙이지 않는다", async () => {
    const f = fakeFetch(() => json(200, { data: { ok: true } }));
    const client = createApiClient({ baseUrl: "/api/v1/", fetchImpl: f.impl });
    await client.get("/me");
    expect(f.calls[0]!.url).toBe("/api/v1/me");
    const headers = f.calls[0]!.init.headers as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase()).sort()).toEqual(["accept"]);
    expect(f.calls[0]!.init.credentials).toBeUndefined();
  });

  it("성공 응답에서 본문·ETag 정수·X-Request-ID·Location을 돌려준다", async () => {
    const f = fakeFetch(() =>
      json(201, { data: { id: "x" } }, { ETag: '"1"', "X-Request-ID": "req-1", Location: "/api/v1/x" }),
    );
    const r = await createApiClient({ fetchImpl: f.impl }).post("/projects", { body: { code: "A" } });
    expect(r).toMatchObject({ status: 201, version: 1, requestId: "req-1", location: "/api/v1/x" });
    expect(f.calls[0]!.init.body).toBe('{"code":"A"}');
    expect((f.calls[0]!.init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("수정 요청은 If-Match를 \"n\" 형식으로 붙이고, 없으면 붙이지 않는다", async () => {
    const f = fakeFetch(() => json(200, { data: {} }, { ETag: '"4"' }));
    const client = createApiClient({ fetchImpl: f.impl });
    await client.patch("/x", { body: { name: "a" }, ifMatch: 3 });
    await client.get("/x");
    expect((f.calls[0]!.init.headers as Record<string, string>)["If-Match"]).toBe('"3"');
    expect((f.calls[1]!.init.headers as Record<string, string>)["If-Match"]).toBeUndefined();
  });

  it("row_version 0도 If-Match로 보낸다(0을 없는 값으로 취급하지 않음)", async () => {
    const f = fakeFetch(() => json(200, { data: {} }));
    await createApiClient({ fetchImpl: f.impl }).patch("/x", { body: {}, ifMatch: 0 });
    expect((f.calls[0]!.init.headers as Record<string, string>)["If-Match"]).toBe('"0"');
  });

  it("쿼리를 붙인다", async () => {
    const f = fakeFetch(() => json(200, { data: [], page: { limit: 50, next_cursor: null } }));
    await createApiClient({ baseUrl: "/api/v1", fetchImpl: f.impl }).get("/projects/p/assets", {
      query: { q: "EQ", sort: "-name", limit: 50 },
    });
    expect(f.calls[0]!.url).toBe("/api/v1/projects/p/assets?q=EQ&sort=-name&limit=50");
  });
});

describe("오류 변환", () => {
  const envelope = (status: number, code: string, details: unknown[] = []) =>
    json(status, { error: { code, message: "메시지", request_id: "req-9", details } });

  it("오류 envelope을 ApiError로 바꾼다(code·requestId·details)", async () => {
    const f = fakeFetch(() =>
      envelope(412, "EDIT_CONFLICT", [{ message: "현재 버전은 2입니다.", field_path: "/row_version" }]),
    );
    const e = await createApiClient({ fetchImpl: f.impl })
      .patch("/x", { body: {}, ifMatch: 1 })
      .catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 412, code: "EDIT_CONFLICT", requestId: "req-9" });
    expect(classifyError(e)).toBe("conflict");
    expect(fieldErrors(e)).toEqual({ "/row_version": "현재 버전은 2입니다." });
  });

  it("JSON이 아닌 오류 본문(프록시 오류 등)은 HTTP_ERROR로 처리하고 상태로 분류한다", async () => {
    const f = fakeFetch(() => new Response("<html>Bad Gateway</html>", { status: 502 }));
    const e = await createApiClient({ fetchImpl: f.impl }).get("/me").catch((x) => x);
    expect(e).toMatchObject({ status: 502, code: "HTTP_ERROR" });
    expect(classifyError(e)).toBe("server");
  });

  it("서버에 닿지 못하면 NetworkError이고 취소는 그대로 전달한다", async () => {
    const down = createApiClient({
      fetchImpl: (async () => {
        throw new TypeError("Failed to fetch");
      }) as unknown as typeof fetch,
    });
    const e = await down.get("/me").catch((x) => x);
    expect(e).toBeInstanceOf(NetworkError);
    expect(classifyError(e)).toBe("network");

    const aborted = createApiClient({
      fetchImpl: (async () => {
        throw new DOMException("aborted", "AbortError");
      }) as unknown as typeof fetch,
    });
    const a = await aborted.get("/me").catch((x) => x);
    expect(a).toBeInstanceOf(DOMException);
    expect(classifyError(a)).toBe("unknown");
  });

  it.each([
    [401, "UNAUTHENTICATED", "unauthenticated"],
    [403, "FORBIDDEN", "forbidden"],
    [404, "NOT_FOUND", "not-found"],
    [409, "VERSION_IMMUTABLE", "state"],
    [409, "REVISION_DRAFT_EXISTS", "state"],
    [409, "INVALID_STATE_TRANSITION", "state"],
    [409, "ASSET_CODE_CONFLICT", "duplicate"],
    [409, "PROJECT_CODE_CONFLICT", "duplicate"],
    [412, "EDIT_CONFLICT", "conflict"],
    [422, "VALIDATION_ERROR", "validation"],
    [422, "INVALID_CURSOR", "validation"],
    [428, "PRECONDITION_REQUIRED", "precondition"],
    [500, "INTERNAL_ERROR", "server"],
    [405, "HTTP_ERROR", "unknown"],
    [418, "SOMETHING_NEW", "unknown"],
  ])("%i %s → %s", (status, code, kind) => {
    expect(classifyError(new ApiError({ status, code, message: "m" }))).toBe(kind);
  });

  it("모르는 code라도 상태로 대략 분류하고, 모르는 예외는 unknown이다", () => {
    expect(classifyError(new ApiError({ status: 503, code: "NEW_ONE", message: "m" }))).toBe("server");
    expect(classifyError(new Error("x"))).toBe("unknown");
  });

  it("details를 검증 패널 항목으로 바꾼다(warning만 경고, 나머지는 오류)", () => {
    const e = new ApiError({
      status: 422,
      code: "VALIDATION_ERROR",
      message: "m",
      details: [
        { message: "a", field_path: "/name", rule_id: "R1" },
        { message: "b", severity: "warning", entity_id: "e1", resolution: "해결" },
      ],
    });
    expect(toIssues(e)).toEqual([
      { severity: "error", message: "a", rule_id: "R1", field_path: "/name" },
      { severity: "warning", message: "b", entity_id: "e1", resolution: "해결" },
    ]);
  });
});
