// 통합 검증용 vitest 설정. 프런트엔드 소스를 읽기만 하며 frontend/ 의 설정·의존성은 바꾸지 않는다.
// 실행(저장소 루트에서): pnpm --dir frontend exec vitest run --config vitest.config.mjs --root ../tests/integration/ui
import { resolve } from "node:path";

const feModules = resolve(import.meta.dirname, "../../../frontend/node_modules");

export default {
  // 이 폴더에는 node_modules가 없으므로 테스트 파일이 쓰는 패키지는 frontend의 설치본을 쓴다(같은 사본이라 React가 중복되지 않는다).
  resolve: { alias: [{ find: /^@testing-library\/(.*)$/, replacement: `${feModules}/@testing-library/$1` }] },
  css: { modules: { localsConvention: "camelCase" } },
  // 프런트엔드 소스(저장소 안의 형제 폴더)를 읽기 위해 저장소 루트까지 허용한다.
  server: { fs: { allow: ["../../.."] } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["../../../frontend/tests/setup.ts"],
    include: ["*.test.{ts,tsx}"],
    testTimeout: 30_000,
    fileParallelism: false,
    css: true,
  },
};
