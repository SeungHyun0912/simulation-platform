import { useState } from "react";
import type { Schemas } from "../../shared/api/types";
import { Button } from "../../shared/components/Button";
import { DataTable, type Column } from "../../shared/components/DataTable";
import { SelectField } from "../../shared/components/Fields";
import { FieldGrid, FilterBar, Note } from "../../shared/components/Layout";
import { SaveErrorNotice } from "../../shared/components/SaveErrorNotice";
import { StateNotice } from "../../shared/components/StateNotice";
import { portText } from "./layoutView";
import type { LayoutAssets } from "./queries";
import { useLayoutWriter } from "./writer";

const SOURCE_TEXT: Record<string, string> = { fixed: "고정 경로", computed: "통로로 계산" };
const REASON_CODE_TEXT: Record<string, string> = {
  PORT_NOT_MAPPED: "포트가 점에 연결되지 않았습니다",
  NO_CONNECTION: "이어진 길이 없습니다",
};

/**
 * 경로 보기(0.18.0 `POST …/paths`, 저장하지 않음): 출발 포트 하나 → 도착 포트 여러 개(다음 설비 후보 비교).
 * 같은 출발·도착으로 저장된 고정 경로가 있으면 그것, 없으면 통로·고정 경로의 선분(양방향)으로 이은 최단 경로. 서버는 **저장된** 배치판만 읽는다.
 */
export function LayoutPathsSection({
  projectId,
  versionId,
  assets,
  dirty,
  highlighted,
  onHighlight,
  onSelectPort,
}: {
  projectId: string;
  versionId: string;
  assets: LayoutAssets;
  dirty: boolean;
  highlighted: string | null;
  onHighlight: (key: string | null, points: string[]) => void;
  onSelectPort: (portId: string) => void;
}) {
  const writer = useLayoutWriter(projectId);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<Schemas["PathOut"][] | null>(null);
  const ports = assets.assets.flatMap((a) => a.ports.map((p) => ({ port: p, asset: a })));
  const rowKey = (r: Schemas["PathOut"]) => `${r.from_port_id}>${r.to_port_id}`;

  async function run() {
    setBusy(true);
    setError(null);
    onHighlight(null, []);
    try {
      const r = await writer.paths(versionId, to.map((t) => ({ from_port_id: from, to_port_id: t })));
      setResult(r);
      const best = [...r].filter((x) => x.reachable).sort((a, b) => Number(a.length_m) - Number(b.length_m))[0];
      if (best) onHighlight(rowKey(best), best.points ?? []);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const cols: Column<Schemas["PathOut"]>[] = [
    { key: "to", header: "도착", render: (r) => portText(assets.portById.get(r.to_port_id), r.to_port_id) },
    {
      key: "ok",
      header: "결과",
      render: (r) =>
        r.reachable ? (
          `갈 수 있음 · ${SOURCE_TEXT[r.source ?? ""] ?? r.source ?? ""}${r.route_key ? ` ${r.route_key}` : ""}`
        ) : (
          <>
            ⚠ 갈 수 없음: {r.reason_code ? (REASON_CODE_TEXT[r.reason_code] ?? r.reason_code) : ""}
            {r.reason ? ` — ${r.reason}` : ""}
            {r.reason_code === "PORT_NOT_MAPPED" && (
              <>
                {" "}
                <Button onClick={() => onSelectPort(r.to_port_id)}>도착 포트 보기</Button> <Button onClick={() => onSelectPort(r.from_port_id)}>출발 포트 보기</Button>
              </>
            )}
          </>
        ),
    },
    { key: "len", header: "길이(m)", align: "end", render: (r) => (r.reachable ? (r.length_m ?? "") : "해당 없음") },
    { key: "pts", header: "점 순서", render: (r) => (r.points ?? []).join(" → ") },
    {
      key: "show",
      header: "",
      render: (r) =>
        r.reachable ? (
          <Button aria-pressed={highlighted === rowKey(r)} onClick={() => (highlighted === rowKey(r) ? onHighlight(null, []) : onHighlight(rowKey(r), r.points ?? []))} aria-label={`${portText(assets.portById.get(r.to_port_id), r.to_port_id)} 경로 도면에 표시`}>
            {highlighted === rowKey(r) ? "표시 중" : "도면에 표시"}
          </Button>
        ) : null,
    },
  ];
  const shortest = result ? [...result].filter((x) => x.reachable).sort((a, b) => Number(a.length_m) - Number(b.length_m))[0] : undefined;

  return (
    <>
      <Note>출발 포트 하나와 도착 포트(여러 개면 다음 설비 후보 비교)를 고르면 서버가 저장된 통로·고정 경로로 최단 경로를 계산합니다. 결과는 저장하지 않습니다. 운반 시간(길이 ÷ 속도)은 후속입니다.</Note>
      {dirty && (
        <StateNotice kind="conflict" title="저장된 내용 기준">
          저장하지 않은 변경은 계산에 들어가지 않습니다. 고친 통로·점으로 보려면 먼저 "내용 저장"을 누르세요.
        </StateNotice>
      )}
      <FieldGrid>
        <SelectField label="출발 포트" value={from} onChange={(e) => setFrom(e.target.value)}>
          <option value="">(고르기)</option>
          {ports.map(({ port, asset }) => (
            <option key={port.id} value={port.id}>
              {portText({ port, asset }, port.id)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="도착 포트(여러 개 고를 수 있음)"
          multiple
          size={6}
          value={to}
          hint="Ctrl·Shift를 누른 채 여러 개를 고르면 후보끼리 비교합니다(최대 500)"
          onChange={(e) => setTo([...e.target.selectedOptions].map((o) => o.value))}
        >
          {ports.map(({ port, asset }) => (
            <option key={port.id} value={port.id}>
              {portText({ port, asset }, port.id)}
            </option>
          ))}
        </SelectField>
      </FieldGrid>
      <FilterBar>
        <Button variant="primary" disabled={!from || to.length === 0 || to.length > 500 || busy} onClick={() => void run()}>
          {busy ? "계산 중…" : `경로 계산(${to.length}쌍)`}
        </Button>
        {highlighted && <Button onClick={() => onHighlight(null, [])}>도면 강조 지우기</Button>}
      </FilterBar>
      {error !== null && <SaveErrorNotice error={error} />}
      {result && (
        <>
          {shortest && result.length > 1 && (
            <p role="status">
              가장 짧은 후보: {portText(assets.portById.get(shortest.to_port_id), shortest.to_port_id)} {shortest.length_m} m
            </p>
          )}
          <DataTable caption="경로 계산 결과" columns={cols} rows={result} getRowKey={rowKey} wrapCells />
        </>
      )}
    </>
  );
}
