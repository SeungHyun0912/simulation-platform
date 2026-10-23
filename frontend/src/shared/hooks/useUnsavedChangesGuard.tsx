import { useEffect } from "react";
import { useBlocker } from "react-router";
import { ConfirmDialog } from "../components/ConfirmDialog";

/**
 * 미저장 변경이 있을 때 화면 이동(프로젝트 전환 포함)과 탭 닫기를 확인한다.
 * 반환된 element를 화면에 한 번 렌더링한다.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const blocker = useBlocker(dirty);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return (
    <ConfirmDialog
      open={blocker.state === "blocked"}
      title="저장하지 않은 변경이 있습니다"
      confirmLabel="변경을 버리고 이동"
      cancelLabel="계속 편집"
      onConfirm={() => blocker.state === "blocked" && blocker.proceed()}
      onCancel={() => blocker.state === "blocked" && blocker.reset()}
    >
      이동하면 입력한 내용이 사라집니다.
    </ConfirmDialog>
  );
}
