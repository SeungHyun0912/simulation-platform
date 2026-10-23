import { getUnit } from "../../shared/units/units";
import type { KnownValue } from "../../shared/components/KnownValueInput";

/**
 * 용량 객체 변환. 화면은 `KnownValue`(모드 `value`)를 쓰고 서버 계약은 `finite`를 쓴다.
 * 계약 0.2.0 규칙: `finite`만 value·unit을 가지며 0 초과이고, 그 외 모드는 value·unit이 null이다.
 * `status`는 서버가 계산하므로 요청에 보내지 않는다. 숫자는 항상 decimal 문자열이다.
 */
export type CapacityMode = "unknown" | "finite" | "unlimited" | "not_allowed";

/** 용량이 받는 단위(계약 0.2.0). 공정 필드의 단위(bobbin, m 등)는 포함하지 않는다. */
export const CAPACITY_UNITS = ["item", "bobbin_slot", "pallet_slot", "kg", "m2"] as const;
const DECIMAL_UNITS: readonly string[] = ["kg", "m2"];

/** 응답 모양(읽기) */
export type CapacityDto = {
  mode: CapacityMode;
  value: string | null;
  unit: string | null;
  status?: string;
};

/** 요청 모양(쓰기). finite 외 모드는 mode만 보낸다. */
export type CapacityRequest =
  | { mode: "finite"; value: string; unit: string }
  | { mode: "unknown" | "unlimited" | "not_allowed" };

export function toCapacityRequest(kv: KnownValue): CapacityRequest {
  switch (kv.mode) {
    case "value":
      return { mode: "finite", value: kv.value, unit: kv.unit ?? CAPACITY_UNITS[0] };
    case "unknown":
    case "unlimited":
    case "not_allowed":
      return { mode: kv.mode };
    default:
      // 용량에는 해당 없음(not_applicable)이 없다. 호출한 쪽의 오류이므로 조용히 바꾸지 않는다.
      throw new Error(`용량에 쓸 수 없는 모드입니다: ${kv.mode}`);
  }
}

export function fromCapacityDto(dto: CapacityDto): KnownValue {
  if (dto.mode === "finite")
    return { mode: "value", value: dto.value ?? "", unit: dto.unit ?? CAPACITY_UNITS[0] };
  // 선택해 둔 단위를 다시 고를 수 있도록 기본 단위를 유지한다(서버에는 보내지 않는다).
  return { mode: dto.mode, value: "", unit: CAPACITY_UNITS[0] };
}

const INTEGER_POSITIVE = /^[1-9]\d*$/;
const DECIMAL_POSITIVE = /^(0|[1-9]\d*)(\.\d{1,6})?$/;

/** 용량 값 검증(값 있음 모드). 0·선행 0·소수 7자리 이상은 허용하지 않는다. */
export function validateCapacity(v: KnownValue): string | null {
  if (v.mode !== "value") return null;
  const unit = v.unit ?? CAPACITY_UNITS[0];
  if (!getUnit(unit) || !(CAPACITY_UNITS as readonly string[]).includes(unit))
    return "용량에 쓸 수 없는 단위입니다.";
  if (v.value.trim() === "") return "값을 입력하세요. 모르는 값이면 '미정'을 선택하세요.";
  if (DECIMAL_UNITS.includes(unit)) {
    if (!DECIMAL_POSITIVE.test(v.value))
      return "소수 6자리까지의 숫자만 입력할 수 있습니다(선행 0 불가).";
    if (/^0(\.0+)?$/.test(v.value)) return ZERO_MESSAGE;
    return null;
  }
  if (v.value === "0") return ZERO_MESSAGE;
  if (!INTEGER_POSITIVE.test(v.value)) return "개수 단위는 선행 0 없는 정수만 입력할 수 있습니다.";
  return null;
}

const ZERO_MESSAGE =
  "0은 용량이 될 수 없습니다. 대기 적재를 허용하지 않으면 '대기 불가'를 선택하세요.";
