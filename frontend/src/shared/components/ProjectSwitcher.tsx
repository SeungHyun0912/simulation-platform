import { DropdownMenu } from "radix-ui";
import styles from "./ProjectSwitcher.module.css";

/** 화면용 프로젝트 항목. accent는 색 외에 이름·코드도 함께 보여 주는 보조 구분이다. */
export type ProjectOption = { id: string; name: string; accent: 1 | 2 | 3 | 4 };

type Props = {
  projects: ProjectOption[];
  currentId: string | null;
  onSelect: (projectId: string) => void;
};

/** 프로젝트 전환 메뉴. 전환 전 미저장 확인은 호출한 쪽의 내비게이션 가드가 처리한다. */
export function ProjectSwitcher({ projects, currentId, onSelect }: Props) {
  const current = projects.find((p) => p.id === currentId);
  const currentName = current?.name ?? currentId;

  return (
    <div className={styles.wrap} data-accent={current?.accent} role="group" aria-label="현재 프로젝트">
      <span className={styles.label}>현재 프로젝트</span>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className={styles.trigger} aria-label={`프로젝트 전환, 현재: ${currentName ?? "선택 안 됨"}`}>
          <span>{currentName ?? "프로젝트 선택"}</span>
          {currentId && <code className={styles.code}>{currentId}</code>}
          <span aria-hidden="true">▾</span>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={styles.menu} align="end" sideOffset={4}>
            {projects.length === 0 ? (
              <div className={styles.empty}>접근 가능한 프로젝트가 없습니다.</div>
            ) : (
              <DropdownMenu.RadioGroup value={currentId ?? ""} onValueChange={onSelect}>
                {projects.map((p) => (
                  <DropdownMenu.RadioItem
                    key={p.id}
                    value={p.id}
                    className={styles.item}
                    data-accent={p.accent}
                  >
                    <DropdownMenu.ItemIndicator className={styles.check}>✓</DropdownMenu.ItemIndicator>
                    <span className={styles.name}>{p.name}</span>
                    <code className={styles.code}>{p.id}</code>
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
