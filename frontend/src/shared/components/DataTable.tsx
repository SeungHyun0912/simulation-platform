import type { ReactNode } from "react";
import styles from "./DataTable.module.css";

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** 정렬 가능 열이면 true. 정렬 자체는 호출한 쪽(서버 또는 화면)이 수행한다. */
  sortable?: boolean;
  align?: "start" | "end";
};

export type SortState = { key: string; direction: "asc" | "desc" } | null;

type Props<T> = {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  sort?: SortState;
  onSortChange?: (next: SortState) => void;
  /** 행 선택 상태를 색 외에 글자로도 알리기 위해 현재 행 키를 받는다. */
  currentRowKey?: string;
};

function ariaSort(sort: SortState | undefined, key: string) {
  if (!sort || sort.key !== key) return "none" as const;
  return sort.direction === "asc" ? ("ascending" as const) : ("descending" as const);
}

/** 정렬 순서: 없음 → 오름차순 → 내림차순 → 없음 */
function nextSort(sort: SortState | undefined, key: string): SortState {
  if (!sort || sort.key !== key) return { key, direction: "asc" };
  return sort.direction === "asc" ? { key, direction: "desc" } : null;
}

export function DataTable<T>({
  caption,
  columns,
  rows,
  getRowKey,
  sort,
  onSortChange,
  currentRowKey,
}: Props<T>) {
  return (
    <div className={styles.scroll} tabIndex={0} role="region" aria-label={`${caption} 표 영역`}>
      <table className={styles.table}>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                aria-sort={c.sortable ? ariaSort(sort, c.key) : undefined}
                className={c.align === "end" ? styles.end : undefined}
              >
                {c.sortable && onSortChange ? (
                  <button
                    type="button"
                    className={styles.sortButton}
                    onClick={() => onSortChange(nextSort(sort, c.key))}
                  >
                    {c.header}
                    <span aria-hidden="true">
                      {sort?.key === c.key ? (sort.direction === "asc" ? " ▲" : " ▼") : " ↕"}
                    </span>
                  </button>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = getRowKey(row);
            return (
              <tr key={key} aria-current={key === currentRowKey ? "true" : undefined}>
                {columns.map((c) => (
                  <td key={c.key} className={c.align === "end" ? styles.end : undefined}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
