"""CR be17: 결과 리포트 요약 문장 규칙(DB 불필요)."""

from decimal import Decimal as D

from simulation_platform.domain import report as rules


def lines(**over):
    base = {"status": "stalled", "termination_reason": "NO_PROGRESS", "observed_min": D(139104), "engine_version": "c0.2",
            "products": [{"code": "P04", "completed_items": 1234, "throughput": D("12.75"), "lead_avg_min": D(2880),
                          "wip_items": D(5), "last_completion_min": D(139000),
                          "shortfalls": [{"pool": "single-12", "step": "싱글-12", "waiting": 3, "held": 3, "needed": 12}]},
                         {"code": "P05", "completed_items": 0, "throughput": None, "lead_avg_min": None, "wip_items": D(0),
                          "last_completion_min": None, "shortfalls": []}],
            "headline": "가장 큰 정체: …", "root_causes": [{"rank": 1, "explanation": "P04 · 싱글 메인: …"}],
            "top_asset": {"code": "EQ-096", "utilization": D("0.9890")}}
    return rules.summary_lines(**(base | over))


def test_the_summary_reads_the_run_each_product_the_bottleneck_and_the_root():
    out = lines()
    assert out[0] == "실행 결과: 더 진행할 수 없어 멈춤(NO_PROGRESS), 가상 96.6일 관측, 엔진 c0.2."
    assert out[1] == "P04: 완료 1,234개, 하루 12.8개, 평균 리드타임 2.0일, 미완료 5개, 마지막 완료 96.5일."
    assert out[2] == "P05: 완료 0개."  # 해당 없음(None)과 0개 미완료는 문장에서 뺀다
    assert out[3] == "가장 큰 정체: …" and out[4] == "고칠 곳 1: P04 · 싱글 메인: …"
    assert out[5] == "가동률이 가장 높은 설비: EQ-096 98.9%."
    assert out[6] == "입력이 모자라 기다리는 단계: P04 싱글-12(필요 12, 보유 3)."


def test_limitations_warn_about_an_unfinished_run_and_never_sum_products():
    notes = rules.limitations(quality_status="incomplete", status="stalled", bottleneck_limitations=["병목 한계"])
    assert notes[0].startswith("끝까지 실행된 결과가 아닙니다(더 진행할 수 없어 멈춤)") and notes[-1] == "병목 한계"
    assert not rules.limitations(quality_status="complete", status="completed", bottleneck_limitations=[])[0].startswith("끝까지")
