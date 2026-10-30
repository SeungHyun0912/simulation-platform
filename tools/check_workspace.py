"""문서 패키지 검증. 애플리케이션·DB·API 테스트가 아닙니다."""
from pathlib import Path
from urllib.parse import unquote
import hashlib
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SKIP = {".git", ".venv", "venv", "node_modules", "__pycache__", "artifacts", "local", "dist", "build"}
REQUIRED = [
    "README.md", "AGENTS.md", "CONTRIBUTING.md",
    "backend/README.md", "backend/AGENTS.md",
    "frontend/README.md", "frontend/AGENTS.md",
    "contracts/README.md", "contracts/contract-status.json",
    "contracts/03_domain_contracts.md", "contracts/04_api_contract.md",
    "docs/architecture/02_erd_database.md",
    "docs/agents/OWNERSHIP.md", "docs/agents/TASK_BOARD.md",
]
# 회사 내부 업무 데이터는 저장소에서 제외하고 로컬(data/local/README.md)에서만 관리한다. 문서가 이 경로를 링크해도 깨진 링크로 보지 않는다.
PRIVATE = {
    "docs/domain/08_catalog_processes.md", "docs/reference/original_specs_v1.zip",
    "docs/reference/attachment_inventory.json", "docs/reference/source_file_manifest.json",
}
CJK = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff]")
LINK = re.compile(r"!?\[[^\]]*\]\(([^)]+)\)")


def without_fences(text):
    lines = []
    fence = None
    for line in text.splitlines():
        match = re.match(r"^\s*(`{3,}|~{3,})", line)
        if match:
            mark = match.group(1)[0]
            if fence is None:
                fence = mark
            elif fence == mark:
                fence = None
            continue
        if fence is None:
            lines.append(line)
    return "\n".join(lines)


def main():
    errors = []
    md_count = json_count = links = 0
    for name in REQUIRED:
        if not (ROOT / name).is_file():
            errors.append(f"필수 파일 없음: {name}")
    paths = [
        p for p in ROOT.rglob("*") if p.is_file()
        and not set(p.relative_to(ROOT).parts).intersection(SKIP)
    ]
    for p in paths:
        relative = p.relative_to(ROOT).as_posix()
        if p.suffix in {".json", ".code-workspace"}:
            json_count += 1
            try:
                json.loads(p.read_text(encoding="utf-8"))
            except Exception as exc:
                errors.append(f"JSON 오류: {relative}: {exc}")
        if p.suffix != ".md":
            continue
        md_count += 1
        text = p.read_text(encoding="utf-8")
        if CJK.search(text):
            errors.append(f"한국어 정규화 확인 필요: {relative}")
        for match in LINK.finditer(without_fences(text)):
            target = match.group(1).strip()
            if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", target) or target.startswith("#"):
                continue
            target = target.split("#", 1)[0].split("?", 1)[0]
            if not target:
                continue
            links += 1
            resolved = (p.parent / unquote(target)).resolve()
            try:
                resolved.relative_to(ROOT)
            except ValueError:
                errors.append(f"저장소 밖 링크: {relative} -> {target}")
                continue
            if not resolved.exists() and resolved.relative_to(ROOT).as_posix() not in PRIVATE:
                errors.append(f"깨진 링크: {relative} -> {target}")
    status_path = ROOT / "contracts/contract-status.json"
    if status_path.exists():
        try:
            state = json.loads(status_path.read_text(encoding="utf-8"))
            if state["status"] not in {"PENDING_REVIEW", "PARTIALLY_APPROVED", "APPROVED"}:
                errors.append("계약 상태값 확인 필요")
            if state["status"] in {"PARTIALLY_APPROVED", "APPROVED"}:
                for key in ["contract_version", "openapi_sha256", "approved_scopes", "approved_by", "approved_at"]:
                    if not state.get(key):
                        errors.append(f"승인 근거 누락: {key}")
                op = (ROOT / state["openapi_path"]).resolve()
                op.relative_to(ROOT)
                if not op.is_file():
                    errors.append("승인 OpenAPI 없음")
                elif hashlib.sha256(op.read_bytes()).hexdigest() != state.get("openapi_sha256"):
                    errors.append("OpenAPI 해시 불일치")
        except Exception as exc:
            errors.append(f"계약 상태 검사 실패: {exc}")
    print(f"Markdown {md_count}, JSON/workspace {json_count}, relative links {links}")
    for error in errors:
        print("ERROR:", error)
    if errors:
        return 1
    print("PASS: 문서·구조 검증. 앱/DB/API/SimPy/외부 링크는 검증하지 않았습니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
