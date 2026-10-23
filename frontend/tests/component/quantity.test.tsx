import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { KnownValueInput, type KnownValue } from "../../src/shared/components/KnownValueInput";
import {
  QuantityInput,
  validateQuantity,
  type Quantity,
} from "../../src/shared/components/QuantityInput";
import { getUnit, UNITS } from "../../src/shared/units/units";

function QuantityHarness({ units, initial }: { units: string[]; initial: Quantity }) {
  const [v, setV] = useState(initial);
  return <QuantityInput label="길이" value={v} onChange={setV} units={units} />;
}

describe("단위 레지스트리", () => {
  it("개수 계열은 정수, 길이·중량은 소수를 허용하며 id가 중복되지 않는다", () => {
    expect(getUnit("bobbin")?.integer).toBe(true);
    expect(getUnit("strand")?.integer).toBe(true);
    expect(getUnit("m")?.integer).toBe(false);
    expect(new Set(UNITS.map((u) => u.id)).size).toBe(UNITS.length);
  });
});

describe("validateQuantity", () => {
  it("빈 값은 0이 아니라 입력 누락이다", () => {
    expect(validateQuantity({ amount: "", unit: "m" })).toBe("값을 입력하세요.");
    expect(validateQuantity({ amount: "0", unit: "m" })).toBeNull();
  });
  it("decimal 문자열을 그대로 허용하고 지수·음수·무한대는 거부한다", () => {
    expect(validateQuantity({ amount: "1000.000000", unit: "m" })).toBeNull();
    for (const bad of ["1e3", "-1", "Infinity", "NaN", "1,000"]) {
      expect(validateQuantity({ amount: bad, unit: "m" })).not.toBeNull();
    }
  });
  it("개수 단위는 정수만 허용한다", () => {
    expect(validateQuantity({ amount: "10", unit: "bobbin" })).toBeNull();
    expect(validateQuantity({ amount: "1.5", unit: "bobbin" })).toMatch(/정수/);
  });
  it("알 수 없는 단위는 오류다", () => {
    expect(validateQuantity({ amount: "1", unit: "furlong" })).toMatch(/알 수 없는 단위/);
  });
});

describe("QuantityInput", () => {
  it("단위가 하나면 고정 문구로 표시하고 선택 상자를 만들지 않는다", () => {
    render(<QuantityHarness units={["m"]} initial={{ amount: "100", unit: "m" }} />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByLabelText("길이 값")).toHaveValue("100");
  });

  it("단위를 바꾸면 해당 단위 규칙으로 즉시 검증한다", async () => {
    const user = userEvent.setup();
    render(<QuantityHarness units={["m", "bobbin"]} initial={{ amount: "1.5", unit: "m" }} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("길이 단위"), "bobbin");
    expect(screen.getByRole("alert")).toHaveTextContent("정수");
    expect(screen.getByLabelText("길이 값")).toBeInvalid();
  });

  it("선속 단위는 기준(분당 처리 길이)을 보조 설명으로 보여 준다", () => {
    render(<QuantityHarness units={["m_per_min"]} initial={{ amount: "32", unit: "m_per_min" }} />);
    expect(screen.getByText(/분당 처리 길이/)).toBeInTheDocument();
  });
});

describe("KnownValueInput + 단위 선택", () => {
  function Harness({ initial }: { initial: KnownValue }) {
    const [v, setV] = useState(initial);
    return (
      <KnownValueInput
        label="용량"
        value={v}
        onChange={setV}
        allowedModes={["unknown", "value"]}
        units={["item", "kg"]}
      />
    );
  }

  it("미정에서 값 있음으로 바꾸면 기본 단위로 시작하고 정수만 받는다", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ mode: "unknown", value: "" }} />);
    await user.click(screen.getByRole("radio", { name: "값 있음" }));
    expect(screen.getByLabelText("용량 단위")).toHaveValue("item");
    await user.type(screen.getByLabelText("용량 값"), "2.5");
    expect(screen.getByRole("alert")).toHaveTextContent("정수");
    await user.selectOptions(screen.getByLabelText("용량 단위"), "kg");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
