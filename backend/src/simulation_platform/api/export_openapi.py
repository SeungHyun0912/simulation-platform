"""OpenAPI 후보 생성: `python -m simulation_platform.api.export_openapi [출력경로]`.

정식 계약(contracts/openapi.json)은 조정자가 diff 검토 후 반영한다. 이 명령은 후보만 만든다.
"""

import hashlib
import json
import sys
from pathlib import Path

from simulation_platform.api.app import create_app

DEFAULT_PATH = Path(__file__).resolve().parents[3] / "artifacts" / "openapi.candidate.json"


def render() -> str:
    schema = create_app().openapi()
    return json.dumps(schema, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def main(argv: list[str]) -> int:
    path = Path(argv[1]) if len(argv) > 1 else DEFAULT_PATH
    text = render()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")
    print(f"{path} sha256={hashlib.sha256(text.encode('utf-8')).hexdigest()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
