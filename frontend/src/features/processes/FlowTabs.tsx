import { NavLink } from "react-router";
import styles from "./ProcessFlowPage.module.css";

/** 공정 플로우차트의 두 보기: 제품 하나를 자세히(수정 가능) / 프로젝트의 모든 제품 공정을 한 장에(읽기). */
export function FlowTabs({ projectId, productId }: { projectId: string; productId?: string }) {
  return (
    <nav className={styles.tabs} aria-label="플로우차트 보기">
      <NavLink to={productId ? `/projects/${projectId}/products/${productId}/flow` : `/projects/${projectId}/flow`} end>
        제품별 플로우차트
      </NavLink>
      <NavLink to={`/projects/${projectId}/flow/all`} end>
        프로젝트 전체 공정
      </NavLink>
    </nav>
  );
}
