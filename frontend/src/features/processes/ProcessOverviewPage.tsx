import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useDataSource } from "../../shared/api/ApiContext";
import { ApiOnlyNotice } from "../../shared/components/ApiOnlyNotice";
import { Button } from "../../shared/components/Button";
import { DataTable, type Column } from "../../shared/components/DataTable";
import { SelectField } from "../../shared/components/Fields";
import { FilterBar, Note, Section } from "../../shared/components/Layout";
import { PageHeader } from "../../shared/components/PageHeader";
import { QueryErrorNotice } from "../../shared/components/QueryErrorNotice";
import { StateNotice } from "../../shared/components/StateNotice";
import { VersionStatusBadge } from "../../shared/components/VersionStatusBadge";
import { useCurrentProject } from "../projects/useCurrentProject";
import { FlowTabs } from "./FlowTabs";
import { GraphDiagram } from "./GraphDiagram";
import { equipmentUsage, groupUsage, nodesUsing, summaryToDoc, type EquipmentGroup, type OverviewEntry } from "./processOverview";
import { useAssetOptions, useProcessGraphBatch } from "./queries";
import styles from "./ProcessFlowPage.module.css";

type Basis = "latest" | "approved";
/** 공용 설비 표를 접었을 때 보이는 줄 수 */
const SHARED_PREVIEW = 5;

/**
 * 프로젝트 전체 공정: 프로젝트의 모든 제품 공정을 한 화면에 제품별 줄로 보여 준다(읽기 전용, 수정은 제품별 플로우차트에서).
 * 일괄 조회 API가 없어 제품마다 그래프를 동시 6개까지 읽는다. 같은 설비를 여러 제품이 쓰는 곳을 표로 모으고,
 * 설비를 고르면 모든 제품 도식에서 그 설비를 쓰는 단계를 강조한다. 제품 간 생산량은 합산하지 않는다.
 */
export function ProcessOverviewPage() {
  const { projectId, label } = useCurrentProject();
  const source = useDataSource();
  const [params, setParams] = useSearchParams();
  const basis: Basis = params.get("basis") === "approved" ? "approved" : "latest";
  const focus = params.get("asset") ?? "";
  // 0.14.0 일괄 조회: 제품마다 따로 부르지 않고 요약을 한 번에(최대 50개씩) 받는다
  const batch = useProcessGraphBatch(projectId, basis);
  const assets = useAssetOptions(projectId);
  const [showAllShared, setShowAllShared] = useState(false);

  const list = batch.status === "success" ? batch.data.items : [];
  const shown = list.filter((p) => p.version && p.summary);
  const missing = list.filter((p) => !p.version);

  function set(next: Record<string, string>) {
    const merged = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) merged.set(k, v);
      else merged.delete(k);
    }
    setParams(merged, { replace: true });
  }

  const head = (
    <PageHeader
      title="프로젝트 전체 공정"
      breadcrumbs={[{ label: "프로젝트", to: "/" }, { label }, { label: "공정", to: `/projects/${projectId}/processes` }, { label: "전체 공정" }]}
      renderLink={(c) => <Link to={c.to!}>{c.label}</Link>}
    />
  );
  if (source === "static") return <>{head}<ApiOnlyNotice subject="프로젝트 전체 공정" /></>;
  if (batch.status === "pending") return <>{head}<FlowTabs projectId={projectId} /><StateNotice kind="loading" /></>;
  if (batch.status === "error") return <>{head}<FlowTabs projectId={projectId} /><QueryErrorNotice error={batch.error} subject="프로젝트 공정" onRetry={batch.retry} /></>;

  const loaded: OverviewEntry[] = shown.map((p) => ({ productId: p.product_id, productCode: p.product_code, doc: summaryToDoc(p.summary!) }));
  const docOf = new Map(loaded.map((e) => [e.productId, e.doc]));
  const usage = equipmentUsage(loaded);
  const groups = groupUsage(usage);
  const shared = groups.filter((g) => g.products.length > 1);
  const sharedAssetCount = shared.reduce((a, g) => a + g.assetIds.length, 0);
  const focusedGroup = groups.find((g) => g.assetIds.includes(focus));
  const focused = usage.find((u) => u.assetId === focus);
  const assetName = (id: string) => {
    const a = assets.status === "success" ? assets.data.byId.get(id) : undefined;
    return a ? `${a.code} ${a.name}` : `자산 ${id.slice(0, 8)}`;
  };
  const pendingCount = batch.data.complete ? 0 : 1;

  const groupName = (g: EquipmentGroup) => (g.assetIds.length === 1 ? assetName(g.key) : `${assetName(g.key)} 외 ${g.assetIds.length - 1}대`);
  const sharedCols: Column<EquipmentGroup>[] = [
    {
      key: "asset",
      header: "설비·공간",
      render: (g) => (
        <>
          {groupName(g)}
          {g.assetIds.length > 1 && <div>{g.assetIds.map((id) => assetName(id).split(" ")[0]).join(", ")}</div>}
        </>
      ),
    },
    { key: "kind", header: "쓰임", render: (g) => (g.kind === "space" ? "저장 공간" : "설비 후보") },
    { key: "count", header: "사용 제품 수", align: "end", render: (g) => g.products.length },
    { key: "where", header: "제품 · 단계", render: (g) => g.products.map((p) => `${p.productCode}: ${p.steps.map((s) => s.label).join(", ")}`).join(" / ") },
    {
      key: "action",
      header: "강조",
      render: (g) => {
        const on = focusedGroup?.key === g.key;
        return (
          <Button onClick={() => set({ asset: on ? "" : g.key })} aria-pressed={on} aria-label={`${groupName(g)} 강조`}>
            {on ? "강조 해제" : "강조"}
          </Button>
        );
      },
    },
  ];

  return (
    <>
      {head}
      <FlowTabs projectId={projectId} />
      <Note>
        프로젝트의 모든 제품 공정을 한 화면에 보여 줍니다(읽기 전용). 제품 이름을 누르면 그 제품의 플로우차트에서 수정할 수 있습니다. 제품 간 생산량은 합산하지 않습니다.
      </Note>
      <FilterBar>
        <SelectField label="보는 버전" value={basis} onChange={(e) => set({ basis: e.target.value === "approved" ? "approved" : "" })}>
          <option value="latest">최신 버전(초안 포함)</option>
          <option value="approved">승인본</option>
        </SelectField>
        <SelectField label="설비 강조" hint="고른 설비·공간을 쓰는 단계·노드를 모든 제품 도식에서 강조합니다." value={focusedGroup?.key ?? ""} onChange={(e) => set({ asset: e.target.value })}>
          <option value="">강조 안 함</option>
          {groups.map((g) => (
            <option key={g.key} value={g.key}>
              {groupName(g)} — 제품 {g.products.length}개
            </option>
          ))}
        </SelectField>
      </FilterBar>
      <ul className={styles.stats} aria-label="프로젝트 공정 요약">
        <li>제품 {list.length}개</li>
        <li>
          {basis === "approved" ? "승인본이 있는 제품" : "공정이 있는 제품"} {shown.length}개
        </li>
        <li>
          여러 제품이 함께 쓰는 설비·공간 {sharedAssetCount}개(사용처 {shared.length}가지)
        </li>
        {pendingCount > 0 && <li role="status">나머지 공정을 불러오는 중입니다</li>}
      </ul>

      {list.length === 0 && (
        <StateNotice kind="empty" title="등록된 제품이 없습니다">
          공정은 제품 아래의 버전으로 만듭니다. 먼저 <Link to={`/projects/${projectId}/products/new`}>제품을 추가</Link>하세요.
        </StateNotice>
      )}
      {list.length > 0 && shown.length === 0 && (
        <StateNotice kind="empty" title={basis === "approved" ? "승인된 공정이 없습니다" : "공정이 있는 제품이 없습니다"}>
          {basis === "approved" ? "'최신 버전'으로 바꾸면 초안 공정도 볼 수 있습니다." : "제품 상세에서 공정 초안을 만들 수 있습니다."}
        </StateNotice>
      )}


      <div className={styles.lanes}>
        {shown.map((p) => {
          const v = p.version!;
          const doc = docOf.get(p.product_id)!;
          const flowLink = `/projects/${projectId}/products/${p.product_id}/flow?version=${v.id}`;
          return (
            <section key={p.product_id} aria-label={`${p.product_code} 공정`}>
              <div className={styles.laneHead}>
                <h2 className={styles.laneTitle}>
                  <Link to={flowLink} aria-label={`${p.product_code} ${p.product_name} 플로우차트 열기`}>
                    {p.product_code} {p.product_name}
                  </Link>
                </h2>
                <span>
                  v{v.version_no} <VersionStatusBadge status={v.status} />
                </span>
                <ul className={styles.stats}>
                  <li>단계 {doc.nodes.filter((n) => n.kind === "operation").length}개</li>
                  <li>
                    노드 {doc.nodes.length} · 간선 {doc.edges.length}
                  </li>
                  <li>{doc.completion_node_id ? "완제품 지정됨" : "완제품 판정 시점 미정"}</li>
                  {focused && nodesUsing(focused, p.product_id).size > 0 && <li>강조 {nodesUsing(focused, p.product_id).size}곳</li>}
                </ul>
              </div>
              {doc.nodes.length === 0 ? (
                <Note>노드가 없습니다.</Note>
              ) : (
                <GraphDiagram
                  doc={doc}
                  completionId={doc.completion_node_id ?? null}
                  highlightIds={nodesUsing(focused, p.product_id)}
                  ariaLabel={`${p.product_code} 공정 도식`}
                  hideLegend
                />
              )}
            </section>
          );
        })}
      </div>

      {shared.length > 0 && (
        <Section id="sec-shared" title="여러 제품이 함께 쓰는 설비·공간">
          <Note>
            같은 설비나 저장 공간을 여러 제품이 쓰면 실행에서 서로 기다릴 수 있습니다. 설비 후보는 각 단계의 후보 설비에서, 저장 공간은 노드의 공간 지정에서 모았고(서버 일괄 조회 요약 기준), 사용처가 같은 것은 한 줄로 묶었습니다.
          </Note>
          <DataTable
            caption="여러 제품이 함께 쓰는 설비·공간"
            columns={sharedCols}
            rows={showAllShared ? shared : shared.slice(0, SHARED_PREVIEW)}
            getRowKey={(g) => g.key}
            currentRowKey={focusedGroup?.key}
            wrapCells
          />
          {shared.length > SHARED_PREVIEW && (
            <p>
              <Button onClick={() => setShowAllShared((v) => !v)} aria-expanded={showAllShared}>
                {showAllShared ? "접기" : `모두 보기(${shared.length}줄)`}
              </Button>
            </p>
          )}
        </Section>
      )}
      {missing.length > 0 && (
        <Note>
          {basis === "approved" ? "승인본이 없는 제품" : "공정이 없는 제품"}: {missing.map((p) => p.product_code).join(", ")}
        </Note>
      )}
      {shown.length > 0 && (
        <ul className={styles.legend} aria-label="범례">
          <li>실선: 물류 · 파선: 선후 관계 · 점선: 공급 · 위로 휘는 곡선: 되돌아가는(순환) 연결 · 점선 테두리 상자: 대기 공간</li>
          <li>굵은 주황 테두리: 강조한 설비·공간을 쓰는 단계·노드 · 검증 결과는 제품별 플로우차트에서 봅니다</li>
        </ul>
      )}
    </>
  );
}
