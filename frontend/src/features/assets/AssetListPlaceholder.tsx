import { useParams } from "react-router";
import { PageHeader } from "../../shared/components/PageHeader";
import { StateNotice } from "../../shared/components/StateNotice";

export function AssetListPlaceholder() {
  const { projectId } = useParams();
  return (
    <>
      <PageHeader
        title="설비·공간"
        breadcrumbs={[{ label: "프로젝트" }, { label: projectId ?? "" }, { label: "설비·공간" }]}
      />
      <StateNotice kind="contract-pending">
        설비 목록 화면은 자산 목록 DTO가 승인된 뒤 구현합니다. 현재는 공통 컴포넌트 단계입니다.
      </StateNotice>
    </>
  );
}
