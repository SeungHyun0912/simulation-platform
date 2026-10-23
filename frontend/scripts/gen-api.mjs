// 승인된 계약 스냅샷(contracts/openapi.json)에서 API 타입을 생성한다.
//   pnpm gen:api      생성(파일 갱신)
//   pnpm check:api    생성물이 승인 스냅샷과 같은지만 확인(파일을 바꾸지 않음, 다르면 종료 코드 1)
//
// 안전장치: openapi.json의 sha256이 contract-status.json의 값과 같을 때만 진행한다.
// 승인되지 않았거나 수정된 스냅샷으로 client를 만들지 않기 위해서다. 생성물은 손으로 고치지 않는다.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const specPath = resolve(root, "contracts", "openapi.json");
const statusPath = resolve(root, "contracts", "contract-status.json");
const outDir = resolve(here, "..", "src", "shared", "api", "generated");
const schemaPath = resolve(outDir, "schema.d.ts");
const metaPath = resolve(outDir, "CONTRACT.json");

const check = process.argv.includes("--check");

const specBytes = readFileSync(specPath);
const sha256 = createHash("sha256").update(specBytes).digest("hex");
const status = JSON.parse(readFileSync(statusPath, "utf8"));

if (status.openapi_sha256 !== sha256) {
  console.error(
    `중단: contracts/openapi.json의 sha256(${sha256})이 contract-status.json의 값(${status.openapi_sha256})과 다릅니다.\n` +
      "승인되지 않았거나 수정된 스냅샷으로 client를 만들지 않습니다. 조정자·Backend에 확인하세요.",
  );
  process.exit(2);
}

const header =
  `// 자동 생성 파일입니다. 직접 수정하지 마세요(수정하면 pnpm check:api가 실패합니다).\n` +
  `// 생성 명령: pnpm gen:api   도구: openapi-typescript\n` +
  `// 기준 계약: version ${status.contract_version}, openapi_sha256 ${sha256}\n` +
  `// 승인 scope: ${(status.approved_scopes ?? []).join(", ")}\n\n`;

const ast = await openapiTS(pathToFileURL(specPath));
const schema = header + astToString(ast);
const meta =
  JSON.stringify(
    {
      contract_version: status.contract_version,
      openapi_sha256: sha256,
      approved_scopes: status.approved_scopes ?? [],
      generated_by: "openapi-typescript",
    },
    null,
    2,
  ) + "\n";

// Git이 체크아웃 때 줄바꿈을 바꿀 수 있으므로(Windows) 비교할 때만 CRLF를 LF로 맞춘다.
const lf = (s) => s.replace(/\r\n/g, "\n");

if (check) {
  const same =
    existsSync(schemaPath) &&
    existsSync(metaPath) &&
    lf(readFileSync(schemaPath, "utf8")) === schema &&
    lf(readFileSync(metaPath, "utf8")) === meta;
  if (!same) {
    console.error("생성물이 승인 스냅샷과 다릅니다. `pnpm gen:api`로 다시 생성하세요.");
    process.exit(1);
  }
  console.log(`OK: 생성물이 contract ${status.contract_version}(${sha256.slice(0, 12)}…)과 같습니다.`);
} else {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(schemaPath, schema, "utf8");
  writeFileSync(metaPath, meta, "utf8");
  console.log(`생성 완료: contract ${status.contract_version}, sha256 ${sha256}`);
}
