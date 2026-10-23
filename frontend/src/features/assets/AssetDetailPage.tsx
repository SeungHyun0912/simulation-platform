import { useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "../../shared/components/Button";
import { TextField } from "../../shared/components/Fields";
import {
  KnownValueInput,
  validateKnownValue,
  type KnownValueMode,
} from "../../shared/components/KnownValueInput";
import { PageHeader } from "../../shared/components/PageHeader";
import { StateNotice } from "../../shared/components/StateNotice";
import { ValidationPanel, type ValidationIssue } from "../../shared/components/ValidationPanel";
import { VersionStatusBadge } from "../../shared/components/VersionStatusBadge";
import { useUnsavedChangesGuard } from "../../shared/hooks/useUnsavedChangesGuard";
import { KIND_LABELS, type AssetView } from "./assetView";
import styles from "./AssetDetailPage.module.css";
import { SAMPLE_ASSETS } from "./sampleAssets";
import { usePreviewState } from "./usePreviewState";

const CAPACITY_MODES: KnownValueMode[] = ["unknown", "value", "unlimited", "not_allowed"];

export function AssetDetailPage() {
  const { projectId = "", assetId = "" } = useParams();
  const preview = usePreviewState();
  const asset = SAMPLE_ASSETS.find((a) => a.id === assetId);

  const header = (title: string, code?: string) => (
    <PageHeader
      title={title}
      breadcrumbs={[
        { label: "프로젝트" },
        { label: projectId },
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
  if (!asset)
    // 서버가 다른 프로젝트의 ID와 존재하지 않는 ID를 구분해 알려 주지 않는 정책을 가정한다.
    return (
      <>
        {header("자산을 찾을 수 없습니다")}
        <StateNotice kind="empty" title="자산을 찾을 수 없습니다">
          <Link to={`/projects/${projectId}/assets`}>목록으로 돌아가기</Link>
        </StateNotice>
      </>
    );

  // key로 프로젝트·자산이 바뀌면 입력 중인 폼 상태를 완전히 버린다.
  return (
    <AssetForm
      key={`${projectId}:${asset.id}`}
      base={asset}
      projectId={projectId}
      showConflict={preview === "conflict"}
    />
  );
}

function AssetForm({
  base,
  projectId,
  showConflict,
}: {
  base: AssetView;
  projectId: string;
  showConflict: boolean;
}) {
  const [draft, setDraft] = useState<AssetView>(base);
  const [conflictDismissed, setConflictDismissed] = useState(false);
  const readOnly = base.status !== "draft";
  const dirty = JSON.stringify(draft) !== JSON.stringify(base);
  const guard = useUnsavedChangesGuard(dirty);

  const capacityError = validateKnownValue(draft.capacity, "integer");
  const nameError = draft.name.trim() === "" ? "이름을 입력하세요." : null;
  const codeError = draft.code.trim() === "" ? "표시 코드를 입력하세요." : null;

  const issues: ValidationIssue[] = [];
  if (nameError) issues.push({ severity: "error", message: nameError, field_path: "/name" });
  if (codeError) issues.push({ severity: "error", message: codeError, field_path: "/code" });
  if (capacityError)
    issues.push({ severity: "error", message: capacityError, field_path: "/capacity" });
  if (draft.capacity.mode === "unknown")
    issues.push({
      severity: "warning",
      message: "대기 용량이 미정입니다. 초안 저장은 가능하지만 실행 전에 해소해야 합니다.",
      field_path: "/capacity",
    });
  const hasError = issues.some((i) => i.severity === "error");

  const isStorage = base.kind !== "equipment";

  return (
    <>
      {guard}
      <PageHeader
        title={`${base.code} ${base.name}`}
        breadcrumbs={[
          { label: "프로젝트" },
          { label: projectId },
          { label: "설비·공간", to: `/projects/${projectId}/assets` },
          { label: base.code },
        ]}
        renderLink={(c) => <Link to={c.to!}>{c.label}</Link>}
        actions={
          <>
            <Button disabled={!dirty} onClick={() => setDraft(base)}>
              되돌리기
            </Button>
            <Button
              variant="primary"
              disabled
              title="저장은 API 연동 후 사용할 수 있습니다 (계약 필요)"
            >
              저장 (계약 필요)
            </Button>
          </>
        }
      />
      <p className={styles.sample}>
        예시 데이터입니다. 입력은 이 화면에서만 유지되며 서버에 저장되지 않습니다.
      </p>

      {showConflict && !conflictDismissed && (
        <div className={styles.block}>
          <StateNotice
            kind="conflict"
            action={
              <>
                <Button
                  onClick={() => {
                    setDraft(base);
                    setConflictDismissed(true);
                  }}
                >
                  최신 내용으로 다시 불러오기
                </Button>
                <Button onClick={() => setConflictDismissed(true)}>내 변경을 유지하고 계속 편집</Button>
              </>
            }
          >
            자동으로 덮어쓰지 않았습니다. 최신 내용을 불러오면 이 화면의 변경은 사라집니다.
          </StateNotice>
        </div>
      )}

      {readOnly && (
        <div className={styles.block}>
          <StateNotice kind="contract-pending" title="읽기 전용">
            초안이 아닌 버전은 수정할 수 없습니다. 복사하여 수정하는 기능은 계약 승인 후 제공됩니다.
          </StateNotice>
        </div>
      )}

      {dirty && <p className={styles.dirty}>● 저장하지 않은 변경이 있습니다</p>}
      {issues.length > 0 && (
        <div className={styles.block}>
          <ValidationPanel issues={issues} />
        </div>
      )}

      <section className={styles.section} aria-labelledby="sec-basic">
        <h2 id="sec-basic" className={styles.heading}>
          기본 정보 <VersionStatusBadge status={base.status} />
        </h2>
        <div className={styles.grid}>
          <TextField label="내부 ID" value={base.id} readOnly hint="변경할 수 없습니다." />
          <TextField label="유형" value={KIND_LABELS[base.kind]} readOnly />
          <TextField
            label="표시 코드"
            value={draft.code}
            readOnly={readOnly}
            error={codeError}
            onChange={(e) => setDraft({ ...draft, code: e.target.value })}
          />
          <TextField
            label="이름"
            value={draft.name}
            readOnly={readOnly}
            error={nameError}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <TextField
            label="모델"
            value={draft.model}
            readOnly={readOnly}
            onChange={(e) => setDraft({ ...draft, model: e.target.value })}
          />
          <TextField
            label="그룹"
            value={draft.group}
            readOnly={readOnly}
            onChange={(e) => setDraft({ ...draft, group: e.target.value })}
          />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="sec-ports">
        <h2 id="sec-ports" className={styles.heading}>
          {isStorage ? "접근 위치" : "입력(IN)·출력(OUT) 포트"}
        </h2>
        <p className={styles.note}>
          포트는 자산과 함께 생성되는 고정 항목이어서 삭제할 수 없습니다. 위치 미정은 미배치 상태이며
          생성·저장을 막지 않습니다.
        </p>
        <ul className={styles.ports}>
          {base.ports.map((p) => (
            <li key={p.kind} className={styles.port}>
              <strong>{p.kind}</strong>
              <span>{p.placement === "unknown" ? "위치 미정 (미배치)" : "배치됨"}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="sec-capacity">
        <h2 id="sec-capacity" className={styles.heading}>
          {isStorage ? "저장 용량" : "대기 용량"}
        </h2>
        <p className={styles.note}>
          단위: 개(item). 미정은 0이나 무제한이 아닙니다.
          {base.kind === "dock" && " 도킹이라는 이유로 용량을 무제한으로 가정하지 않습니다."}
        </p>
        <KnownValueInput
          label="용량"
          value={draft.capacity}
          onChange={(capacity) => setDraft({ ...draft, capacity })}
          allowedModes={CAPACITY_MODES}
          numberKind="integer"
          unit="개"
          disabled={readOnly}
        />
        {draft.capacity.mode === "not_allowed" && (
          <p className={styles.note}>이 포트에는 대기 적재를 허용하지 않습니다.</p>
        )}
      </section>

      {hasError && <p className={styles.note}>오류를 해결해야 저장할 수 있습니다.</p>}
      <p className={styles.preview}>
        상태 미리보기:{" "}
        {["", "conflict", "forbidden"].map((s) => (
          <Link key={s} to={s ? `?state=${s}` : "."} className={styles.previewLink}>
            {s || "정상"}
          </Link>
        ))}
      </p>
    </>
  );
}
