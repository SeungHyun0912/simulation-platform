// 실제 서버(통합 전용) 호출 도우미. 프런트엔드의 실제 API 클라이언트를 사용한다. Mock 없음.
import { createApiClient } from "../../../frontend/src/shared/api/client";

export const API = (process.env.INT_API ?? "http://127.0.0.1:8100/api/v1").replace(/\/+$/, "");
if (new URL(API).port === "8000") throw new Error("INT_API가 공유 개발 서버(8000)를 가리킵니다. 통합 검증은 전용 서버에서만 실행합니다.");

export const RUN = Math.random().toString(16).slice(2, 8);
export const USERS = {
  admin: "e5a11d34-ddab-5412-bf1b-a0daeb2bb81a",
  editor: "be97ba06-d557-541d-a215-60d98b14de06",
  viewer: "2628054b-3888-5d81-ad9d-05cd7e1829c2",
  other_org: "e64d894b-9649-5c64-af56-d4fcc7d52997",
} as const;
export const PROJECT_WIRE = "b16c84ae-4033-5315-bd1d-a562b2e9e180";
export const PROJECT_A = "9985bf99-c375-58b0-a776-5a1cc5053585";

export function clientAs(user: keyof typeof USERS) {
  const fetchImpl = ((url: string, init: RequestInit = {}) =>
    fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), "X-Debug-User": USERS[user] } })) as typeof fetch;
  return createApiClient({ baseUrl: API, fetchImpl });
}
