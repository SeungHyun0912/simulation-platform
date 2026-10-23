import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { router } from "./app/router";
import { ApiProvider } from "./shared/api/ApiContext";
import "./shared/styles/tokens.css";
import "./shared/styles/global.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 4xx는 다시 시도해도 같다. 네트워크·서버 오류만 한 번 더 시도한다.
      retry: (count, error) => count < 1 && !(error as { status?: number }).status,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ApiProvider>
        <RouterProvider router={router} />
      </ApiProvider>
    </QueryClientProvider>
  </StrictMode>,
);
