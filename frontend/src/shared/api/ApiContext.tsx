import { createContext, useContext, type ReactNode } from "react";
import { api as defaultClient, type ApiClient } from "./client";

/**
 * 데이터 출처. 둘 중 하나로 고정하며 실패했다고 다른 쪽으로 자동 전환하지 않는다.
 * - static: 화면 확인용 정적 예시(서버 호출 없음). 화면에 "예시"를 표시한다.
 * - api:    실제 API(계약 0.2.0).
 */
export type DataSource = "static" | "api";

export function defaultDataSource(): DataSource {
  // 기본은 실제 API다. 정적 예시는 `VITE_DATA_SOURCE=static`으로 명시했을 때만 쓴다(자동 전환 없음).
  return import.meta.env?.VITE_DATA_SOURCE === "static" ? "static" : "api";
}

type Value = { source: DataSource; client: ApiClient };

const ApiCtx = createContext<Value>({ source: defaultDataSource(), client: defaultClient });

export function ApiProvider({
  source = defaultDataSource(),
  client = defaultClient,
  children,
}: {
  source?: DataSource;
  client?: ApiClient;
  children: ReactNode;
}) {
  return <ApiCtx.Provider value={{ source, client }}>{children}</ApiCtx.Provider>;
}

export function useDataSource(): DataSource {
  return useContext(ApiCtx).source;
}

export function useApiClient(): ApiClient {
  return useContext(ApiCtx).client;
}
