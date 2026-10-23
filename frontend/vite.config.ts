import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// 로컬 개발 전용 proxy. 브라우저는 같은 출처(/api)만 호출하므로 CORS가 필요 없다.
// 개발용 사용자 식별자는 번들에 들어가지 않도록 VITE_ 접두사가 없는 셸 환경변수로만 읽는다.
// 계약이 아니며 운영 인증이 정해지면 이 부분이 바뀐다(TECH-002).
const apiTarget = process.env.DEV_API_TARGET ?? "http://127.0.0.1:8000";
const debugUser = process.env.DEV_DEBUG_USER ?? "";

export default defineConfig({
  plugins: [react()],
  css: { modules: { localsConvention: "camelCase" } },
  server: {
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        headers: debugUser ? { "X-Debug-User": debugUser } : {},
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    css: true,
  },
});
