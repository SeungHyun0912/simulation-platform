import { useState } from "react";
import { Link, useParams } from "react-router";
import { useDataSource } from "../../shared/api/ApiContext";
import { SaveErrorNotice } from "../../shared/components/SaveErrorNotice";
import { classifyError } from "../../shared/api/errors";
import { QueryErrorNotice } from "../../shared/components/QueryErrorNotice";
import { Button } from "../../shared/components/Button";
import { ConflictNotice } from "../../shared/components/ConflictNotice";
import { DataTable, type Column } from "../../shared/components/DataTable";
import { SelectField, TextAreaField, TextField } from "../../shared/components/Fields";
import { KnownValueInput } from "../../shared/components/KnownValueInput";
import {
  Block,
  FieldGrid,
  Note,
  PreviewStateLinks,
  SampleDataNotice,
  Section,
} from "../../shared/components/Layout";
import { ReasonDialog } from "../../shared/components/ReasonDialog";
import { PageHeader } from "../../shared/components/PageHeader";
import { StateNotice } from "../../shared/components/StateNotice";
import { ValidationPanel, type ValidationIssue } from "../../shared/components/ValidationPanel";
import { VersionStatusBadge } from "../../shared/components/VersionStatusBadge";
import { usePreviewState } from "../../shared/hooks/usePreviewState";
import { useUnsavedChangesGuard } from "../../shared/hooks/useUnsavedChangesGuard";
import { formatDateTime } from "../../shared/format/datetime";
import { canApprove, canEdit, projectRoleLabel } from "../projects/projectView";
import { useProjectTimezone } from "../projects/queries";
import { useCurrentProject } from "../projects/useCurrentProject";
import {
  isOpenStatus,
  isRevisionEditable,
  KIND_LABELS,
  statusLabel,
  validateInfoDraft,
  type AssetInfo,
  type InfoDraft,
  type RevisionDetail,
} from "./assetView";
import styles from "./AssetDetailPage.module.css";
import { CAPACITY_UNITS, validateCapacity } from "./capacityAdapter";
import { useAssetDetail } from "./queries";
import type { EditKey } from "./revisionPatch";
import { PortRuleInput } from "./PortRuleInput";
import { useInfoEditor } from "./useInfoEditor";
import { useRevisionEditor } from "./useRevisionEditor";

/** 충돌 안내에서 필드를 부르는 이름 */
const INFO_LABELS: Record<keyof InfoDraft, string> = {
  code: "표시 코드",
  name: "이름",
  sortOrder: "정렬 순서",
  externalRef: "외부 참조",
  notes: "메모",
  equipmentType: "설비 유형",
  modelName: "모델",
  spaceType: "공간 유형",
};

const CAPACITY_MODES = ["unknown", "value", "unlimited", "not_allowed"] as const;
const CAPACITY_UNIT_LIST = [...CAPACITY_UNITS];

export function AssetDetailPage() {
  const { projectId, project, label } = useCurrentProject();
  const timeZone = useProjectTimezone(projectId);
  const { assetId = "" } = useParams();
  const source = useDataSource();
  const previewParam = usePreviewState();
  // ?state= 미리보기는 정적 모드에서만 쓴다. API 모드에서는 실제 요청 결과만 보여 준다.
  const preview = source === "static" ? previewParam : null;
  const detail = useAssetDetail(projectId, assetId);

  const header = (title: string, code?: string) => (
    <PageHeader
      title={title}
      breadcrumbs={[
        { label: "프로젝트", to: "/" },
        { label },
        { label: "설비·공간", to: `/projects/${projectId}/assets` },
        { label: code ?? "상세" },
      ]}
      renderLink={(c) => <Link to={c.to!}>{c.label}</Link>}
    />
  );

  if (preview === "forbidden")
    return (
      <>
        {header("접근 불가")}
        <StateNotice kind="forbidden">이 자산을 볼 권한이 없습니다.</StateNotice>
      </>
    );
  if (detail.status === "pending")
    return (
      <>
        {header("자산")}
        <StateNotice kind="loading" />
      </>
    );
  if (detail.status === "error") {
    // 서버는 다른 프로젝트의 자산과 없는 자산을 구분하지 않고 404로 답한다. 형식이 틀린 id(422)도 같은 화면으로 처리한다.
    const kind = classifyError(detail.error);
    const notFound = kind === "not-found" || kind === "validation";
    return (
      <>
        {header(notFound ? "자산을 찾을 수 없습니다" : "자산")}
        {notFound ? (
          <StateNotice kind="empty" title="자산을 찾을 수 없습니다">
            <Link to={`/projects/${projectId}/assets`}>목록으로 돌아가기</Link>
          </StateNotice>
        ) : (
          <QueryErrorNotice error={detail.error} subject="자산" onRetry={detail.retry} />
        )}
      </>
    );
  }
  const { asset, revisions } = detail.data;

  // key로 프로젝트·자산이 바뀌면 입력 중인 폼 상태를 완전히 버린다.
  return (
    <AssetDetail
      key={`${projectId}:${asset.id}`}
      asset={asset}
      revisions={revisions}
      projectId={projectId}
      projectLabel={label}
      role={project?.role}
      timeZone={timeZone}
      infoConflict={preview === "conflict"}
      revisionConflict={preview === "conflict-revision"}
    />
  );
}

type DetailProps = {
  asset: AssetInfo;
  revisions: RevisionDetail[];
  projectId: string;
  projectLabel: string;
  role: string | undefined;
  timeZone: string | undefined;
  infoConflict: boolean;
  revisionConflict: boolean;
};

function AssetDetail({
  asset,
  revisions,
  projectId,
  projectLabel,
  role,
  timeZone,
  infoConflict,
  revisionConflict,
}: DetailProps) {
  // 기본 정보(자산 리소스)의 입력·저장·충돌 상태는 훅이 맡는다. 버전(용량·규칙)과 ETag·저장이 따로다.
  const editor = useInfoEditor(asset, projectId, infoConflict);
  const info = editor.info;
  const [selectedId, setSelectedId] = useState<string | null>(
    asset.latestRevision?.id ?? revisions[0]?.id ?? null,
  );
  const [rejectOpen, setRejectOpen] = useState(false);

  const source = useDataSource();
  const mayEdit = canEdit(role);
  const infoDirty = editor.dirty;
  const selected = revisions.find((r) => r.id === selectedId) ?? null;
  // 버전(용량·규칙)의 입력·저장·전이는 훅이 맡는다. 자산 기본 정보와 ETag·충돌·저장이 따로다.
  const rev = useRevisionEditor({
    projectId,
    assetId: asset.id,
    selected,
    previewConflict: revisionConflict,
    onSelect: setSelectedId,
  });
  const guard = useUnsavedChangesGuard(infoDirty || rev.anyDirty);

  // 클라이언트 형식 검사 + 서버가 돌려준 필드 오류(서버가 더 구체적이므로 우선)
  const serverFieldErrors = Object.fromEntries(Object.entries(editor.fieldErrors).filter(([, v]) => v)) as Partial<
    Record<keyof InfoDraft, string>
  >;
  const clientInfoErrors = validateInfoDraft(info, asset.kind);
  const infoErrors = { ...clientInfoErrors, ...serverFieldErrors };
  const infoHasClientError = Object.keys(clientInfoErrors).length > 0;
  const canSaveInfo = source === "api" && mayEdit && infoDirty && !infoHasClientError && !editor.saving;
  const isEquipment = asset.kind === "equipment";

  const edit = selected ? rev.edit : null;
  const revisionDirty = rev.dirty;
  const editable = selected ? isRevisionEditable(selected.status, mayEdit) : false;
  const openRevision = revisions.find((r) => isOpenStatus(r.status)) ?? null;
  const live = source === "api";
  const busy = rev.busy !== null;

  // 입력 형식 오류(클라이언트)와 서버 검증 결과(issues)를 함께 보여 준다. 서버 결과가 정본이며 저장하면 갱신된다.
  const clientIssues: ValidationIssue[] = [];
  if (selected && edit) {
    selected.ports.forEach((p, i) => {
      const cap = edit.ports[p.portId]?.capacity;
      const msg = cap ? validateCapacity(cap) : null;
      if (msg)
        clientIssues.push({
          severity: "error",
          message: `${p.role} 대기 용량: ${msg}`,
          field_path: `/ports/${i}/buffer_capacity/value`,
        });
    });
    const msg = edit.storageCapacity ? validateCapacity(edit.storageCapacity) : null;
    if (msg)
      clientIssues.push({
        severity: "error",
        message: `저장 용량: ${msg}`,
        field_path: "/storage_capacity/value",
      });
  }
  const revisionIssues = [...clientIssues, ...(selected?.issues ?? [])];

  const revisionOptionLabel = (r: RevisionDetail) =>
    `v${r.revisionNo} ${statusLabel(r.status)}` +
    (r.id === asset.latestRevision?.id ? " · 최신" : "") +
    (r.id === asset.currentRevision?.id ? " · 현재 승인본" : "");

  const historyColumns: Column<RevisionDetail>[] = [
    { key: "no", header: "버전", render: (r) => `v${r.revisionNo}` },
    { key: "status", header: "상태", render: (r) => <VersionStatusBadge status={r.status} /> },
    {
      key: "mark",
      header: "구분",
      render: (r) =>
        [r.id === asset.currentRevision?.id ? "현재 승인본" : "", r.id === asset.latestRevision?.id ? "최신" : ""]
          .filter(Boolean)
          .join(" · ") || "-",
    },
    { key: "approved", header: `승인 시각 (${timeZone ?? "Asia/Seoul 기본"})`, render: (r) => formatDateTime(r.approvedAt, timeZone) },
    {
      key: "open",
      header: "작업",
      render: (r) => (
        <Button
          onClick={() => setSelectedId(r.id)}
          aria-label={`v${r.revisionNo} 보기`}
          disabled={r.id === selectedId}
        >
          {r.id === selectedId ? "보는 중" : "보기"}
        </Button>
      ),
    },
  ];

  return (
    <>
      {guard}
      <PageHeader
        title={`${asset.code} ${asset.name}`}
        breadcrumbs={[
          { label: "프로젝트", to: "/" },
          { label: projectLabel },
          { label: "설비·공간", to: `/projects/${projectId}/assets` },
          { label: asset.code },
        ]}
        renderLink={(c) => <Link to={c.to!}>{c.label}</Link>}
      />
      <SampleDataNotice>
        {source === "static"
          ? "예시 데이터입니다(계약 0.2.0 예제 모양). 입력은 이 화면에서만 유지되며 서버에 저장되지 않습니다."
          : "서버에서 불러온 데이터입니다. 저장하면 서버에 반영됩니다."}
      </SampleDataNotice>
      <Block>
        <Note>
          내 역할: {role ? projectRoleLabel(role) : "알 수 없음"}
          {mayEdit
            ? ""
            : " — 수정할 수 없습니다(버튼 노출만 제한하며 최종 권한은 서버가 판정합니다)."}
        </Note>
      </Block>

      {/* ───── 기본 정보: 버전이 없는 리소스. 항상 편집 가능(역할이 허용하면). 자산 ETag ───── */}
      <Section id="sec-info" title="기본 정보">
        {editor.conflict && (
          <ConflictNotice
            resource="자산 기본 정보"
            onReload={() => void editor.reloadFromServer()}
            onKeepEditing={() => void editor.keepMineAndMerge()}
          />
        )}
        <SaveErrorNotice error={editor.error} />
        {editor.general.length > 0 && <ValidationPanel issues={editor.general} />}
        <FieldGrid>
          <TextField label="내부 ID" value={asset.id} readOnly hint="변경할 수 없습니다." />
          <TextField label="종류" value={KIND_LABELS[asset.kind]} readOnly hint="만든 뒤 바꿀 수 없습니다." />
          <TextField
            label="표시 코드"
            value={info.code}
            readOnly={!mayEdit}
            error={infoErrors.code}
            onChange={(e) => editor.edit("code", e.target.value)}
          />
          <TextField
            label="이름"
            value={info.name}
            readOnly={!mayEdit}
            error={infoErrors.name}
            onChange={(e) => editor.edit("name", e.target.value)}
          />
          {isEquipment ? (
            <>
              <TextField
                label="설비 유형"
                value={info.equipmentType}
                readOnly={!mayEdit}
                error={infoErrors.equipmentType}
                onChange={(e) => editor.edit("equipmentType", e.target.value)}
              />
              <TextField
                label="모델"
                hint="비우면 입력 없음으로 저장됩니다."
                value={info.modelName}
                readOnly={!mayEdit}
                error={infoErrors.modelName}
                onChange={(e) => editor.edit("modelName", e.target.value)}
              />
            </>
          ) : (
            <TextField
              label="공간 유형"
              value={info.spaceType}
              readOnly={!mayEdit}
              error={infoErrors.spaceType}
              onChange={(e) => editor.edit("spaceType", e.target.value)}
            />
          )}
          <TextField
            label="정렬 순서"
            inputMode="numeric"
            value={info.sortOrder}
            readOnly={!mayEdit}
            error={infoErrors.sortOrder}
            onChange={(e) => editor.edit("sortOrder", e.target.value)}
          />
          <TextField
            label="외부 참조"
            value={info.externalRef}
            readOnly={!mayEdit}
            error={infoErrors.externalRef}
            onChange={(e) => editor.edit("externalRef", e.target.value)}
          />
        </FieldGrid>
        <TextAreaField
          label="메모"
          value={info.notes}
          readOnly={!mayEdit}
          error={infoErrors.notes}
          onChange={(e) => editor.edit("notes", e.target.value)}
        />
        <h3 className={styles.rulesTitle}>포트</h3>
        <Note>
          포트는 자산과 함께 만들어지는 고정 항목이어서 삭제할 수 없습니다. 위치는 아직 API에 없어
          "위치 미정(미배치)"으로 표시합니다.
        </Note>
        <ul className={styles.rules}>
          {asset.ports.map((p) => (
            <li key={p.id} className={styles.ruleRow}>
              <strong>{p.role}</strong>
              {p.label !== p.role && <span>{p.label}</span>}
              <span>위치 미정 (미배치)</span>
            </li>
          ))}
        </ul>
        {Object.entries(editor.hints).some(([, v]) => v) && (
          <Note>
            저장하기 전에 다른 사용자가 바꾼 값이 있습니다. 내 입력을 유지했으며, 저장하면 아래 항목은 내 값으로 바뀝니다:{" "}
            {(Object.entries(editor.hints) as [keyof InfoDraft, string | undefined][])
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => `${INFO_LABELS[k]}(서버 값: ${v === "" ? "비어 있음" : v})`)
              .join(", ")}
          </Note>
        )}
        <div className={styles.sectionActions}>
          {infoDirty && <strong>● 기본 정보에 저장하지 않은 변경이 있습니다</strong>}
          {editor.saved && !infoDirty && <span role="status">기본 정보를 저장했습니다.</span>}
          <Button disabled={!infoDirty || editor.saving} onClick={editor.reset}>
            기본 정보 되돌리기
          </Button>
          <Button
            variant="primary"
            disabled={!canSaveInfo}
            onClick={() => void editor.save()}
            title={
              source === "static"
                ? "정적 예시 화면에서는 저장하지 않습니다"
                : !mayEdit
                  ? "이 역할은 수정할 수 없습니다"
                  : infoHasClientError
                    ? "오류를 해결해야 저장할 수 있습니다"
                    : undefined
            }
          >
            {editor.saving ? "저장 중…" : source === "static" ? "기본 정보 저장 (정적 예시)" : "기본 정보 저장"}
          </Button>
        </div>
      </Section>

      {/* ───── 버전: 상태·용량·규칙. 버전 ETag. 편집은 draft에서만 ───── */}
      <Section id="sec-revision" title="용량·규칙 (버전)">
        {rev.conflict && (
          <ConflictNotice
            resource="용량 버전"
            onReload={() => void rev.reloadFromServer()}
            onKeepEditing={() => void rev.keepMineAndMerge()}
          />
        )}
        <SaveErrorNotice error={rev.error} />
        {rev.general.length > 0 && <ValidationPanel issues={rev.general} />}
        {rev.notice && <p role="status">{rev.notice}</p>}
        {revisions.length === 0 || !selected || !edit ? (
          <>
            <StateNotice kind="empty" title="버전이 없습니다">
              자산을 만들어도 버전은 자동으로 만들어지지 않습니다. 용량을 설정하려면 새 버전(초안)을
              시작합니다.
            </StateNotice>
            {mayEdit && (
              <div>
                <Button
                  variant="primary"
                  disabled={!live || busy}
                  onClick={() => void rev.createDraft()}
                  title={live ? undefined : "정적 예시 화면에서는 버전을 만들지 않습니다"}
                >
                  {rev.busy === "creating" ? "만드는 중…" : "용량 설정 시작"}
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className={styles.status}>
              <SelectField
                label="버전"
                value={selected.id}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {revisions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {revisionOptionLabel(r)}
                  </option>
                ))}
              </SelectField>
              <span>
                상태: <VersionStatusBadge status={selected.status} />
              </span>
            </div>

            {!editable && (
              <StateNotice
                kind="contract-pending"
                title={mayEdit ? "읽기 전용 버전" : "수정할 수 없음"}
              >
                {selected.status !== "draft"
                  ? `${statusLabel(selected.status)} 상태의 버전은 수정할 수 없습니다.`
                  : "현재 역할로는 수정할 수 없습니다."}{" "}
                {mayEdit && selected.status !== "draft" && openRevision && openRevision.id !== selected.id && (
                  <Button onClick={() => setSelectedId(openRevision.id)}>
                    열린 버전(v{openRevision.revisionNo}) 보기
                  </Button>
                )}
                {mayEdit && !openRevision && (
                  <Button
                    disabled={!live || busy}
                    onClick={() => void rev.createDraft()}
                    title={live ? undefined : "정적 예시 화면에서는 버전을 만들지 않습니다"}
                  >
                    {rev.busy === "creating" ? "만드는 중…" : "새 초안 만들기"}
                  </Button>
                )}
              </StateNotice>
            )}
            {selected.rejectionReason && (
              <Note>반려 사유: {selected.rejectionReason}</Note>
            )}

            {revisionIssues.length > 0 && (
              <>
                <ValidationPanel issues={revisionIssues} />
                {revisionDirty && (
                  <Note>
                    아래 서버 검증 결과는 마지막으로 저장된 값 기준이며 저장하면 갱신됩니다.
                  </Note>
                )}
              </>
            )}
            {rev.hints.length > 0 && (
              <Note>
                저장하기 전에 다른 사용자가 바꾼 값이 있습니다. 내 입력을 유지했으며, 저장하면 아래 항목은 내 값으로 바뀝니다:{" "}
                {rev.hints.map((k) => hintLabel(k, selected)).join(", ")}
              </Note>
            )}

            <div className={styles.sectionActions}>
              {revisionDirty && <strong>● 용량·규칙에 저장하지 않은 변경이 있습니다</strong>}
              <Button disabled={!revisionDirty || busy} onClick={rev.reset}>
                용량 되돌리기
              </Button>
              {editable && (
                <Button
                  variant="primary"
                  disabled={!live || !revisionDirty || clientIssues.length > 0 || busy}
                  onClick={() => void rev.save()}
                  title={
                    !live
                      ? "정적 예시 화면에서는 저장하지 않습니다"
                      : clientIssues.length > 0
                        ? "오류를 해결해야 저장할 수 있습니다"
                        : undefined
                  }
                >
                  {rev.busy === "saving" ? "저장 중…" : live ? "용량·규칙 저장" : "용량·규칙 저장 (정적 예시)"}
                </Button>
              )}
              {mayEdit && selected.status === "draft" && (
                <Button
                  disabled={!live || revisionDirty || busy}
                  onClick={() => void rev.transition("submit")}
                  title={
                    !live
                      ? "정적 예시 화면에서는 요청하지 않습니다"
                      : revisionDirty
                        ? "먼저 저장해야 검토를 요청할 수 있습니다"
                        : undefined
                  }
                >
                  {rev.busy === "transition" ? "처리 중…" : "검토 요청"}
                </Button>
              )}
              {canApprove(role) && selected.status === "in_review" && (
                <>
                  <Button
                    variant="primary"
                    disabled={!live || busy}
                    onClick={() => void rev.transition("approve")}
                    title={live ? undefined : "정적 예시 화면에서는 승인하지 않습니다"}
                  >
                    {rev.busy === "transition" ? "처리 중…" : "승인"}
                  </Button>
                  <Button
                    disabled={!live || busy}
                    onClick={() => setRejectOpen(true)}
                    title={live ? undefined : "정적 예시 화면에서는 반려하지 않습니다"}
                  >
                    반려
                  </Button>
                </>
              )}
            </div>
            <ReasonDialog
              open={rejectOpen}
              title="이 버전을 반려할까요?"
              label="반려 사유"
              confirmLabel="반려"
              maxLength={1000}
              busy={rev.busy === "transition"}
              onCancel={() => setRejectOpen(false)}
              onConfirm={(reason) => {
                setRejectOpen(false);
                void rev.transition("reject", reason);
              }}
            >
              반려하면 이 버전은 초안으로 돌아가며, 사유가 작성자에게 표시됩니다.
            </ReasonDialog>
          </>
        )}
      </Section>

      {selected && edit && (
        <>
          {isEquipment ? (
            selected.ports.map((p) => {
              const pe = edit.ports[p.portId];
              if (!pe) return null;
              return (
                <Section key={p.portId} id={`sec-port-${p.role}`} title={`${p.role} 포트`}>
                  <KnownValueInput
                    label={`${p.role} 대기 용량`}
                    value={pe.capacity}
                    onChange={(kv) => rev.setCapacity(p.portId, kv)}
                    allowedModes={[...CAPACITY_MODES]}
                    units={CAPACITY_UNIT_LIST}
                    validator={validateCapacity}
                    error={rev.fieldErrors[`${p.portId}:capacity`]}
                    disabled={!editable}
                  />
                  <Note>미정은 0이나 무제한이 아닙니다. 대기 적재를 허용하지 않으면 "대기 불가"를 선택하세요.</Note>
                  <h3 className={styles.rulesTitle}>이동·배출 규칙</h3>
                  <PortRuleInput
                    portRole={p.role}
                    dispatch={pe.dispatch}
                    release={pe.release}
                    onDispatch={(d) => rev.setDispatch(p.portId, d)}
                    onRelease={(r) => rev.setRelease(p.portId, r)}
                    disabled={!editable}
                    dispatchError={rev.fieldErrors[`${p.portId}:dispatch`]}
                    releaseError={rev.fieldErrors[`${p.portId}:release`]}
                  />
                </Section>
              );
            })
          ) : (
            <Section id="sec-storage" title="저장 용량">
              {edit.storageCapacity && (
                <KnownValueInput
                  label="저장 용량"
                  value={edit.storageCapacity}
                  onChange={rev.setStorage}
                  allowedModes={[...CAPACITY_MODES]}
                  units={CAPACITY_UNIT_LIST}
                  validator={validateCapacity}
                  error={rev.fieldErrors.storage}
                  disabled={!editable}
                />
              )}
              <Note>
                {asset.kind === "dock"
                  ? "도킹이라는 이유로 용량을 무제한으로 가정하지 않습니다. "
                  : ""}
                접근 포트(ACCESS)에는 용량·규칙 정책이 없고, 저장 용량은 이 공간 전체에 하나만 둡니다.
              </Note>
            </Section>
          )}
        </>
      )}

      {revisions.length > 0 && (
        <Section id="sec-history" title="버전 이력">
          <DataTable
            caption={`${asset.code} 버전 이력`}
            columns={historyColumns}
            rows={revisions}
            getRowKey={(r) => r.id}
            currentRowKey={selectedId ?? undefined}
          />
        </Section>
      )}

      {source === "static" && <PreviewStateLinks states={["conflict", "conflict-revision", "forbidden"]} />}
    </>
  );
}

/** 병합 시 서버 값과 겹친 항목을 사람이 읽는 이름으로 */
function hintLabel(key: EditKey, rev: RevisionDetail): string {
  if (key === "storage") return "저장 용량";
  const [portId, field] = key.split(":") as [string, "capacity" | "dispatch" | "release"];
  const role = rev.ports.find((p) => p.portId === portId)?.role ?? "포트";
  return `${role} ${{ capacity: "대기 용량", dispatch: "이동 규칙", release: "배출 규칙" }[field]}`;
}
