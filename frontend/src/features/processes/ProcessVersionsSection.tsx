import { Link, useNavigate } from "react-router";
import { useDataSource } from "../../shared/api/ApiContext";
import { Button } from "../../shared/components/Button";
import { DataTable, type Column } from "../../shared/components/DataTable";
import { Note, Section } from "../../shared/components/Layout";
import { QueryErrorNotice } from "../../shared/components/QueryErrorNotice";
import { SaveErrorNotice } from "../../shared/components/SaveErrorNotice";
import { StateNotice } from "../../shared/components/StateNotice";
import { VersionStatusBadge } from "../../shared/components/VersionStatusBadge";
import { formatDateTime } from "../../shared/format/datetime";
import { canEdit } from "../projects/projectView";
import { useProjectTimezone } from "../projects/queries";
import { isOpenProcessStatus, type ProcessVersionListItem } from "./processView";
import { useProcessVersions } from "./queries";
import { useDraftCreator } from "./useDraftCreator";

/**
 * 제품의 공정 버전 목록과 새 초안. 서버의 버전만 보여 주며(정적 모드는 정적 예시) 열린 버전(초안·검토 중)은 제품당 하나다.
 * 새 초안은 승인본이 있으면 서버가 그래프를 복사해 시작한다. 이미 열린 버전이 있으면 그 버전으로 이동한다.
 */
export function ProcessVersionsSection({
  projectId,
  productId,
  productCode,
  role,
}: {
  projectId: string;
  productId: string;
  productCode: string;
  role: string | undefined;
}) {
  const source = useDataSource();
  const live = source === "api";
  const navigate = useNavigate();
  const timeZone = useProjectTimezone(projectId);
  const versions = useProcessVersions(projectId, productId);
  const drafts = useDraftCreator(projectId, productId, (id) =>
    navigate(`/projects/${projectId}/products/${productId}/processes/${id}`),
  );
  const mayEdit = canEdit(role);

  const list = versions.status === "success" ? versions.data : [];
  const open = list.find((v) => isOpenProcessStatus(v.status)) ?? null;
  const byId = new Map(list.map((v) => [v.id, v]));

  const columns: Column<ProcessVersionListItem>[] = [
    { key: "no", header: "버전", render: (v) => `v${v.versionNo}` },
    { key: "status", header: "상태", render: (v) => <VersionStatusBadge status={v.status} /> },
    {
      key: "base",
      header: "기준 버전",
      render: (v) => (v.baseVersionId ? `v${byId.get(v.baseVersionId)?.versionNo ?? "?"}` : "-"),
    },
    { key: "approved", header: `승인 시각 (${timeZone ?? "Asia/Seoul 기본"})`, render: (v) => formatDateTime(v.approvedAt, timeZone) },
    {
      key: "edit",
      header: "작업",
      render: (v) => (
        <Link
          to={`/projects/${projectId}/products/${productId}/processes/${v.id}`}
          aria-label={`v${v.versionNo} ${v.status === "draft" ? "공정 편집" : "공정 보기"}`}
        >
          {v.status === "draft" ? "공정 편집" : "공정 보기"}
        </Link>
      ),
    },
  ];

  let body;
  if (versions.status === "pending") body = <StateNotice kind="loading" />;
  else if (versions.status === "error")
    body = <QueryErrorNotice error={versions.error} subject="공정 버전" onRetry={versions.retry} />;
  else if (list.length === 0)
    body = (
      <StateNotice kind="empty" title="공정 버전이 없습니다">
        이 제품에는 아직 공정이 없습니다.
      </StateNotice>
    );
  else body = <DataTable caption={`${productCode} 공정 버전`} columns={columns} rows={list} getRowKey={(v) => v.id} />;

  return (
    <Section id="sec-versions" title="공정 버전">
      <Note>
        승인된 버전은 수정할 수 없고, 변경하려면 새 초안을 만듭니다(승인본이 있으면 그래프를 복사해 시작합니다). 열린 버전(초안·검토 중)은 제품당 하나만 둘 수 있습니다.
      </Note>
      {body}
      <SaveErrorNotice error={drafts.error} />
      {drafts.notice && <p role="status">{drafts.notice}</p>}
      {mayEdit && (
        <div>
          <Button
            disabled={!live || drafts.busy || open !== null || versions.status !== "success"}
            onClick={() => void drafts.create()}
            title={
              !live
                ? "정적 예시 화면에서는 만들지 않습니다"
                : open
                  ? `이미 열린 버전(v${open.versionNo})이 있어 새 초안을 만들 수 없습니다`
                  : undefined
            }
          >
            {drafts.busy ? "만드는 중…" : live ? "새 초안 만들기" : "새 초안 만들기 (연동 전)"}
          </Button>
        </div>
      )}
    </Section>
  );
}
