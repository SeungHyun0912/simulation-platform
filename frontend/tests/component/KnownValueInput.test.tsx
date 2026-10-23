import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import {
  KnownValueInput,
  validateKnownValue,
  type KnownValue,
} from "../../src/shared/components/KnownValueInput";

function Harness({ initial }: { initial: KnownValue }) {
  const [v, setV] = useState(initial);
  return (
    <KnownValueInput
      label="용량"
      value={v}
      onChange={setV}
      allowedModes={["unknown", "value", "unlimited"]}
      unit="개"
    />
  );
}

describe("KnownValueInput", () => {
  it("미정 상태에서는 값 입력란이 없고 0으로 취급하지 않는다", () => {
    render(<Harness initial={{ mode: "unknown", value: "" }} />);
    expect(screen.getByRole("radio", { name: "미정" })).toBeChecked();
    expect(screen.queryByLabelText("용량 값")).not.toBeInTheDocument();
  });

  it("허용하지 않은 상태(해당 없음)는 노출하지 않는다", () => {
    render(<Harness initial={{ mode: "unknown", value: "" }} />);
    expect(screen.queryByRole("radio", { name: "해당 없음" })).not.toBeInTheDocument();
  });

  it("값 있음을 선택하고 비워 두면 오류를 알린다", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ mode: "unknown", value: "" }} />);
    await user.click(screen.getByRole("radio", { name: "값 있음" }));
    expect(screen.getByRole("alert")).toHaveTextContent("값을 입력하세요");
    expect(screen.getByLabelText("용량 값")).toBeInvalid();
  });

  it("무제한 선택 시 값 입력란이 사라진다", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ mode: "value", value: "4" }} />);
    await user.click(screen.getByRole("radio", { name: "무제한" }));
    expect(screen.queryByLabelText("용량 값")).not.toBeInTheDocument();
  });

  it("decimal 문자열만 허용하고 0은 유효한 값이다", () => {
    expect(validateKnownValue({ mode: "value", value: "0" })).toBeNull();
    expect(validateKnownValue({ mode: "value", value: "1000.000000" })).toBeNull();
    expect(validateKnownValue({ mode: "value", value: "-1" })).not.toBeNull();
    expect(validateKnownValue({ mode: "value", value: "Infinity" })).not.toBeNull();
    expect(validateKnownValue({ mode: "unknown", value: "" })).toBeNull();
  });
});
