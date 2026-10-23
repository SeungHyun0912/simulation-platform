import { useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "../../shared/components/Button";
import { ConflictNotice } from "../../shared/components/ConflictNotice";
import { DataTable, type Column } from "../../shared/components/DataTable";
import { CheckboxField, TextField } from "../../shared/components/Fields";
import {
  Block,
  DirtyIndicator,
  FieldGrid,
  Note,
  PreviewStateLinks,
  SampleDataNotice,
  Section,
} from "../../shared/components/Layout";
import { PageHeader } from "../../shared/components/PageHeader";
import { StateNotice } from "../../shared/components/StateNotice";
import { ValidationPanel, type ValidationIssue } from "../../shared/components/ValidationPanel";
import { VersionStatusBadge } from "../../shared/components/VersionStatusBadge";
import { usePreviewState } from "../../shared/hooks/usePreviewState";
import { useUnsavedChangesGuard } from "../../shared/hooks/useUnsavedChangesGuard";
import type { ProcessVersionView, ProductView } from "./productView";
import { useCurrentProject } from "../projects/useCurrentProject";
import { SAMPLE_PRODUCTS } from "./sampleProducts";

export function ProductDetailPage() {
  const { projectId, label: projectLabel } = useCurrentProject();
  const { productId = "" } = useParams();
  const preview = usePreviewState();
  const product = SAMPLE_PRODUCTS.find((p) => p.id === productId);

  const header = (title: string) => (
    <PageHeader
      title={title}
      breadcrumbs={[{ label: "프로젝트" }, { label: projectLabel }, { label: "제품" }]}
    />
  );

  if (preview === "forbidden")
    return (
      <>
        {header("접근 불가")}
        <StateNotice kind="forbidden">이 제품을 볼 권한이 없습니다.</StateNotice>
      </>
    );
  if (!product)
    // 다른 프로젝트의 ID와 없는 ID를 구분하지 않는 404 정책(04 §1 제안)을 가정한다.
    return (
      <>
        {header("제품을 찾을 수 없습니다")}
        <StateNotice kind="empty" title="제품을 찾을 수 없습니다">
          <Link to={`/projects/${projectId}/products`}>목록으로 돌아가기</Link>
        </StateNotice>
      </>
    );

  // key로 프로젝트·제품이 바뀌면 입력 중인 폼 상태를 완전히 버린다.
  return (
    <ProductForm
      key={`${projectId}:${product.id}`}
      base={product}
      projectId={projectId}
      showConflict={preview === "conflict"}
    />
  );
}

function ProductForm({
  base,
  projectId,
  showConflict,
}: {
  base: ProductView;
  projectId: string;
  showConflict: boolean;
}) {
  const { label: projectLabel } = useCurrentProject();
  const [draft, setDraft] = useState<ProductView>(base);
  const [conflictDismissed, setConflictDismissed] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(base);
  const guard = useUnsavedChangesGuard(dirty);

  const nameError = draft.name.trim() === "" ? "이름을 입력하세요." : null;
  const codeError = draft.code.trim() === "" ? "표시 코드를 입력하세요." : null;
  const specUnknown = draft.specification === null;
  // 빈 문자열은 미정이 아니다. 미정이면 체크박스로 명시해야 한다.
  const specEmpty = draft.specification !== null && draft.specification.trim() === "";

  const issues: ValidationIssue[] = [];
  if (specEmpty)
    issues.push({
      severity: "error",
      message: "규격이 비어 있습니다. 값을 입력하거나 '규격 미정'을 선택하세요.",
      field_path: "/specification",
    });
  if (nameError) issues.push({ severity: "error", message: nameError, field_path: "/name" });
  if (codeError) issues.push({ severity: "error", message: codeError, field_path: "/code" });
  if (specUnknown)
    issues.push({
      severity: "warning",
      message: "규격이 미정입니다. 초안 저장은 가능하지만 공정 승인·실행 전에 확인이 필요합니다.",
      field_path: "/specification",
    });

  const versionColumns: Column<ProcessVersionView>[] = [
    { key: "no", header: "버전", render: (v) => `v${v.versionNo}` },
    { key: "status", header: "상태", render: (v) => <VersionStatusBadge status={v.status} /> },
    {
      key: "edit",
      header: "작업",
      render: (v) => (
        <Link
          to={`/projects/${projectId}/products/${base.id}/processes/${v.id}`}
          aria-label={`v${v.versionNo} ${v.status === "draft" ? "공정 편집" : "공정 보기"}`}
        >
          {v.status === "draft" ? "공정 편집 (초안 UI)" : "공정 보기 (초안 UI)"}
        </Link>
      ),
    },
  ];
  const versions = [...base.versions].sort((a, b) => b.versionNo - a.versionNo);

  return (
    <>
      {guard}
      <PageHeader
        title={`${base.code} ${base.name}`}
        breadcrumbs={[
          { label: "프로젝트" },
          { label: projectLabel },
          { label: "제품", to: `/projects/${projectId}/products` },
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
      <SampleDataNotice>
        예시 데이터입니다. 입력은 이 화면에서만 유지되며 서버에 저장되지 않습니다.
      </SampleDataNotice>

      {showConflict && !conflictDismissed && (
        <Block>
          <ConflictNotice
            onReload={() => {
              setDraft(base);
              setConflictDismissed(true);
            }}
            onKeepEditing={() => setConflictDismissed(true)}
          />
        </Block>
      )}

      {dirty && <DirtyIndicator />}
      {issues.length > 0 && (
        <Block>
          <ValidationPanel issues={issues} />
        </Block>
      )}

      <Section id="sec-basic" title="기본 정보">
        <FieldGrid>
          <TextField label="내부 ID" value={base.id} readOnly hint="변경할 수 없습니다." />
          <TextField
            label="표시 코드"
            value={draft.code}
            error={codeError}
            onChange={(e) => setDraft({ ...draft, code: e.target.value })}
          />
          <TextField
            label="이름"
            value={draft.name}
            error={nameError}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <TextField
            label="규격"
            value={draft.specification ?? ""}
            disabled={specUnknown}
            error={specEmpty ? "규격을 입력하거나 '규격 미정'을 선택하세요." : null}
            hint="규격 표기 형식은 계약 승인 후 확정됩니다."
            onChange={(e) => setDraft({ ...draft, specification: e.target.value })}
          />
        </FieldGrid>
        <CheckboxField
          label="규격 미정"
          checked={specUnknown}
          onChange={(e) => setDraft({ ...draft, specification: e.target.checked ? null : "" })}
        />
        <Note>미정은 비어 있는 값과 다릅니다. 알 수 없으면 "규격 미정"을 선택하세요.</Note>
      </Section>

      <Section id="sec-versions" title="공정 버전">
        <Note>
          승인된 버전은 수정할 수 없고, 변경하려면 복사하여 새 초안을 만듭니다. 공정 화면은 계약
          승인 전의 초안 UI이며, 새 초안 생성은 계약 승인 후 제공됩니다.
        </Note>
        {versions.length === 0 ? (
          <StateNotice kind="empty" title="공정 버전이 없습니다">
            이 제품에는 아직 공정이 없습니다.
          </StateNotice>
        ) : (
          <DataTable
            caption={`${base.code} 공정 버전`}
            columns={versionColumns}
            rows={versions}
            getRowKey={(v) => v.id}
          />
        )}
        <div>
          <Button disabled title="새 초안 생성 API 계약 필요">
            새 초안 만들기 (계약 필요)
          </Button>
        </div>
      </Section>

      <PreviewStateLinks states={["conflict", "forbidden"]} />
    </>
  );
}
