import { PageHeader } from "../../shared/components/PageHeader";
import { StateNotice } from "../../shared/components/StateNotice";

export function HomePlaceholder() {
  return (
    <>
      <PageHeader title="프로젝트" />
      <StateNotice kind="contract-pending">
        프로젝트 목록·생성·선택은 승인된 API 계약(project-assets-ports 범위)이 필요합니다.
      </StateNotice>
    </>
  );
}
