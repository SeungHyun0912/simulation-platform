import type { ReactNode } from "react";
import { Dialog } from "radix-ui";
import { Button } from "./Button";
import styles from "./ConfirmDialog.module.css";

type Props = {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/** 확인 대화상자. 포커스 가둠·Esc 닫기·닫힌 뒤 포커스 복귀는 Radix Dialog가 처리한다. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "취소",
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <Dialog.Title className={styles.title}>{title}</Dialog.Title>
          <Dialog.Description asChild>
            <div className={styles.body}>{children}</div>
          </Dialog.Description>
          <div className={styles.actions}>
            <Button onClick={onCancel}>{cancelLabel}</Button>
            <Button variant="primary" onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
