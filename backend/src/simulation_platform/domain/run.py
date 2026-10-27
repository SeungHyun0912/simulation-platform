"""실행 요청의 순수 규칙(HTTP·ORM 비의존): 입력 스냅샷 조립, 정규화 JSON·해시, 요청 지문.

스냅샷은 실행을 요청하는 순간의 시나리오 버전·공정 버전 그래프·고정한 자산 버전·가정·종료 규칙·seed·엔진 정보를 담은 JSON dict이며,
worker는 이것만 읽어 실행한다(현재 master를 읽지 않음). 정규화 JSON(키 정렬·공백 없음·유니코드 그대로)의 SHA-256을
`input_hash`로 남겨 나중에 같은 입력인지 확인한다.
"""

import hashlib
import json

import simpy

from simulation_platform.domain.scenario import ProductInput
from simulation_platform.simulation import ENGINE_VERSION

SNAPSHOT_SCHEMA_VERSION = "1.0"
IDEMPOTENCY_KEY_MAX = 128


def canonical_json(value) -> str:
    """해시 대상 정규화 직렬화. decimal은 문자열이라 표현이 하나로 정해지고, 객체는 키 순서를 고정한다."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_of(value) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def request_fingerprint(scenario_version_id, seed: int, replicate_index: int) -> str:
    """같은 Idempotency-Key로 온 요청 본문이 같은지 비교하는 지문."""
    return sha256_of({"scenario_version_id": str(scenario_version_id), "seed": seed,
                      "replicate_index": replicate_index})


def build_snapshot(*, project_id, scenario: dict, inputs: list[ProductInput], pinned_assets: dict[str, dict],
                   seed: int, replicate_index: int, event_limit: int) -> dict:
    """입력 스냅샷. 제품 순서가 같은 시각 동순위의 처리 순서이므로 시나리오의 제품 순서를 그대로 둔다."""
    return {
        "schema_version": SNAPSHOT_SCHEMA_VERSION,
        "engine": {"version": ENGINE_VERSION, "simpy": simpy.__version__},
        "project_id": str(project_id),
        "scenario": scenario,
        "seed": seed,
        "replicate_index": replicate_index,
        "engine_options": {"event_limit": event_limit},
        "products": [{
            "product_id": item.product_id,
            "process_version": item.version,
            "graph": item.graph,
            "arrivals": item.arrivals,
            "assumptions": item.assumptions,
        } for item in inputs],
        "assets": pinned_assets,
    }
