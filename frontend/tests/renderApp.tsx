import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../src/app/router";
import { ApiProvider, type DataSource } from "../src/shared/api/ApiContext";
import { createApiClient } from "../src/shared/api/client";

type Options = {
  /** 기본은 정적 예시. "api"이면 fetchImpl(가짜 서버)을 통해서만 데이터를 얻는다. */
  source?: DataSource;
  fetchImpl?: typeof fetch;
};

/** 앱 전체(라우터 + 쿼리 클라이언트 + 데이터 출처)를 메모리 라우터로 렌더링한다. */
export function renderApp(path: string, options: Options = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: options.fetchImpl });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ApiProvider source={options.source ?? "static"} client={client}>
        <RouterProvider router={router} />
      </ApiProvider>
    </QueryClientProvider>,
  );
  return { router, queryClient, ...utils };
}
