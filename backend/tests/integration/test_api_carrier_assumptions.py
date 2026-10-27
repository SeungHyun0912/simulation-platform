"""BE-15: 시나리오 가정의 새 필드(out_release·carrier_empty_move_minutes)가 저장·검증되는지 실제 PostgreSQL로 확인한다."""

from test_api_scenarios import (  # noqa: F401
    ctx,
    etag,
    new_scenario,
    ok,
    patch,
    precheck,
    product_entry,
    version_of,
)


def test_new_assumptions_are_saved_and_need_a_reason(client, ctx):
    version = version_of(client, ctx, new_scenario(client, ctx))
    assumptions = {"out_release": "hold", "carrier_empty_move_minutes": "3"}
    saved = ok(patch(client, ctx, version, {"products": [product_entry(ctx, assumptions=assumptions)]}))
    stored = saved["products"][0]["assumptions"]
    assert (stored["out_release"], stored["carrier_empty_move_minutes"]) == ("hold", "3")
    # 가정을 썼는데 사유가 없으면 사전검증 오류(SCN-ASM-001)
    assert "SCN-ASM-001" in {i["rule_id"] for i in precheck(client, ctx, saved)["issues"]}
    with_reason = ok(patch(client, ctx, saved, {"assumption_reason": "운반·출력 대기 가정(시험)"}))
    assert "SCN-ASM-001" not in {i["rule_id"] for i in precheck(client, ctx, with_reason)["issues"]}


def test_bad_values_for_the_new_assumptions_are_rejected(client, ctx):
    version = version_of(client, ctx, new_scenario(client, ctx))
    for bad in ({"out_release": "drop"}, {"carrier_empty_move_minutes": "-1"}, {"carrier_empty_move_minutes": 3.5}):
        r = patch(client, ctx, version, {"products": [product_entry(ctx, assumptions=bad)]})
        assert r.status_code == 422, bad
