"""작업물(WorkItem)과 계보(lineage). 작업물은 m당 객체가 아니라 보빈·롤 같은 단위다(07 §3)."""

from dataclasses import dataclass
from fractions import Fraction


@dataclass
class WorkItem:
    key: str
    length_m: Fraction | None  # None = 길이 없음(해당 없음): 길이가 생기기 전의 원자재·태신선 산출
    form: str | None = None
    state: str | None = None  # 재료 상태(예: 단계 출력 spec의 state_code)
    location: str | None = None  # 현재 노드 key
    status: str = "active"  # active | consumed(분할로 소비됨) | completed(경로 끝 도달)
    parent_key: str | None = None
    lot: str | None = None
    created_at: Fraction = Fraction(0)
    process_version_id: str | None = None  # 이 작업물이 흐르는 공정 버전
    weight_kg: Fraction | None = None  # 무게로만 다루는 작업물(길이와 서로 환산하지 않는다)


@dataclass(frozen=True)
class LineageRecord:
    """한 작업(operation)이 부모 작업물을 어떻게 바꿨는지. 길이 합계가 맞는지 검증할 수 있다."""

    operation_id: str
    step_key: str
    relation: str  # split | transform | supply(같은 작업물이 공급 상태로) | yield(지정 산출, abstract_yield)
    parent_key: str
    child_keys: tuple[str, ...]
    parent_length_m: Fraction | None
    child_lengths_m: tuple[Fraction | None, ...]
    residual_length_m: Fraction = Fraction(0)
    process_version_id: str | None = None
    carried_in_m: Fraction = Fraction(0)  # 잔량 풀에서 이어 받은 길이
    parent_keys: tuple[str, ...] = ()  # yield: 투입 작업물 전부(parent_key는 첫 번째)
    accounting_mode: str = "physical"  # physical | abstract_yield(물량 보존 검증 예외, 03 §5)

    @property
    def balanced(self) -> bool | None:
        """자식 길이 합 + 잔량 = 부모 길이(물량 보존). abstract_yield이거나 길이가 없는 쪽이 있으면(무게↔길이는 환산하지
        않는다) 보존을 주장하지 않으므로 None(검증 대상 아님)."""
        if self.accounting_mode == "abstract_yield" or self.parent_length_m is None \
                or any(length is None for length in self.child_lengths_m):
            return None
        return (sum(self.child_lengths_m, Fraction(0)) + self.residual_length_m
                == self.parent_length_m + self.carried_in_m)


class ItemFactory:
    """안정적인 작업물 key를 순서대로 만든다(같은 입력이면 같은 key)."""

    def __init__(self) -> None:
        self._count = 0

    def new(self, **fields) -> WorkItem:
        self._count += 1
        return WorkItem(key=f"item-{self._count:04d}", **fields)
