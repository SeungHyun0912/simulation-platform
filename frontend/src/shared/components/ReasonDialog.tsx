import { useState, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { Button } from "./Button";
import { TextAreaField } from "./Fields";
import styles from "./ConfirmDialog.module.css";

type Props = {
  open: boolean;
  title: string;
  children?: ReactNode;
  /** 입력 칸 이름(예: "반려 사유") */
  label: string;
  confirmLabel: string;
  /** 계약상 최대 글자 수 */
  maxLength: number;
  busy?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
};

/**
 * 사유를 반드시 입력받는 확인 대화상자(반려 등). 확장 제안 CR로 승인된 공통 컴포넌트다.
 * 공백만 입력한 사유는 비어 있는 것으로 본다. 닫으면 입력은 버린다.
 */
export function ReasonDialog(props: Props) {
  return (
    <Dialog.Root open={props.open} onOpenChange={(next) => !next && props.onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          {/* 열 때마다 새로 마운트되어 이전 입력이 남지 않는다 */}
          <ReasonForm {...props} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ReasonForm({ title, children, label, confirmLabel, maxLength, busy, onConfirm, onCancel }: Props) {
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const reason = text.trim();
  const error = !touched
    ? null
    : reason === ""
      ? `${label}을(를) 입력하세요.`
      : reason.length > maxLength
        ? `${label}은(는) ${maxLength}자 이하여야 합니다.`
        : null;
  const valid = reason !== "" && reason.length <= maxLength;

  return (
    <>
      <Dialog.Title className={styles.title}>{title}</Dialog.Title>
      <Dialog.Description asChild>
        <div className={styles.body}>{children}</div>
      </Dialog.Description>
      <TextAreaField
        label={label}
        value={text}
        error={error}
        onChange={(e) => {
          setText(e.target.value);
          setTouched(true);
        }}
        onBlur={() => setTouched(true)}
      />
      <div className={styles.actions}>
        <Button onClick={onCancel} disabled={busy}>
          취소
        </Button>
        <Button
          variant="primary"
          disabled={!valid || busy}
          onClick={() => {
            if (valid) onConfirm(reason);
            else setTouched(true);
          }}
        >
          {busy ? "처리 중…" : confirmLabel}
        </Button>
      </div>
    </>
  );
}
