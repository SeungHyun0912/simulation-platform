"""실행 요청의 순수 규칙: 정규화 해시·요청 지문(DB 없이)."""

from simulation_platform.domain import run as rules


def test_canonical_hash_does_not_depend_on_key_order_or_spacing():
    a = {"b": [1, {"y": "한글", "x": "1.50"}], "a": None}
    b = {"a": None, "b": [1, {"x": "1.50", "y": "한글"}]}
    assert rules.canonical_json(a) == rules.canonical_json(b) == '{"a":null,"b":[1,{"x":"1.50","y":"한글"}]}'
    assert rules.sha256_of(a) == rules.sha256_of(b)
    assert len(rules.sha256_of(a)) == 64


def test_decimal_strings_keep_their_exact_text_so_a_different_value_changes_the_hash():
    assert rules.sha256_of({"length_m": "1000"}) != rules.sha256_of({"length_m": "1000.0"})  # 입력 문자열 그대로 고정


def test_request_fingerprint_changes_with_the_body():
    base = rules.request_fingerprint("11111111-1111-1111-1111-111111111111", 0, 0)
    assert base == rules.request_fingerprint("11111111-1111-1111-1111-111111111111", 0, 0)
    assert base != rules.request_fingerprint("11111111-1111-1111-1111-111111111111", 1, 0)
    assert base != rules.request_fingerprint("11111111-1111-1111-1111-111111111111", 0, 1)
    assert base != rules.request_fingerprint("22222222-2222-2222-2222-222222222222", 0, 0)
