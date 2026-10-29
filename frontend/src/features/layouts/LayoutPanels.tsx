import { useState } from "react";
import type { Schemas } from "../../shared/api/types";
import { Button } from "../../shared/components/Button";
import { DataTable, type Column } from "../../shared/components/DataTable";
import { SelectField, TextAreaField, TextField } from "../../shared/components/Fields";
import { FieldGrid, FilterBar, Note } from "../../shared/components/Layout";
import { StateNotice } from "../../shared/components/StateNotice";
import {
  mapPort,
  nextRouteKey,
  pastePlacements,
  pastePoints,
  patchPlacement,
  patchPoint,
  pointOfPort,
  pointUsage,
  removePlacement,
  removePoint,
  removeRoute,
  renamePoint,
  upsertRoute,
  type DocErrors,
  type LayoutDoc,
  type LayoutRoute,
  type Target,
} from "./layoutDoc";
import { MODE_SUGGESTIONS, modeText, portText, roleText, unknownText } from "./layoutView";
import type { LayoutAssets } from "./queries";

export type RouteDraft = { editingKey: string | null; key: string; fromPortId: string; toPortId: string; mode: string; points: string[] };

/** 포트 선택지: 자산 코드 순, "EQ-001 OUT(산출)" */
function PortOptions({ assets }: { assets: LayoutAssets }) {
  return (
    <>
      <option value="">(고르지 않음)</option>
      {assets.assets.flatMap((a) =>
        a.ports.map((p) => (
          <option key={p.id} value={p.id}>
            {portText({ port: p, asset: a }, p.id)}
          </option>
        )),
      )}
    </>
  );
}

/** 운반 방식: 제안값 + 지금 값이 제안 밖이면 원문 그대로 */
function ModeField({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [other, setOther] = useState(value !== "" && !MODE_SUGGESTIONS.some((m) => m.value === value));
  return (
    <>
      <SelectField
        label="운반 방식"
        value={other ? "__other" : value}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value === "__other") setOther(true);
          else {
            setOther(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="">정하지 않음</option>
        {MODE_SUGGESTIONS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
        <option value="__other">직접 입력</option>
      </SelectField>
      {other && <TextField label="운반 방식(직접 입력)" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />}
    </>
  );
}

/**
 * 경로 그리기: 출발·도착 포트를 고르고 도면에서 점을 순서대로 누른다. 출발 포트가 점에 매핑돼 있으면 그 점에서 시작한다.
 * 첫 점 = 출발 포트의 점, 끝 점 = 도착 포트의 점이어야 승인할 수 있다(LAY-001·002) — 여기서는 안내만 하고 판정은 서버가 한다.
 */
export function RouteDraftPanel({
  doc,
  draft,
  assets,
  onChange,
  onDone,
  onCancel,
}: {
  doc: LayoutDoc;
  draft: RouteDraft;
  assets: LayoutAssets;
  onChange: (d: RouteDraft) => void;
  onDone: (r: { doc: LayoutDoc; key: string }) => void;
  onCancel: () => void;
}) {
  const fromPoint = draft.fromPortId ? pointOfPort(doc, draft.fromPortId) : "";
  const toPoint = draft.toPortId ? pointOfPort(doc, draft.toPortId) : "";
  const key = draft.key.trim() || (draft.editingKey ?? nextRouteKey(doc));
  const dupKey = key !== draft.editingKey && doc.routes.some((r) => r.key === key);
  const hints: string[] = [];
  if (draft.fromPortId && !fromPoint) hints.push("출발 포트가 아직 점에 연결되지 않았습니다(승인 전 연결 필요).");
  if (draft.toPortId && !toPoint) hints.push("도착 포트가 아직 점에 연결되지 않았습니다(승인 전 연결 필요).");
  if (fromPoint && draft.points.length > 0 && draft.points[0] !== fromPoint) hints.push(`첫 점이 출발 포트의 점(${fromPoint})이 아닙니다.`);
  if (toPoint && draft.points.length > 1 && draft.points[draft.points.length - 1] !== toPoint) hints.push(`끝 점이 도착 포트의 점(${toPoint})이 아닙니다.`);
  const ready = draft.fromPortId && draft.toPortId && draft.points.length >= 2 && !dupKey;
  return (
    <section aria-label="경로 그리기">
      <h3>{draft.editingKey ? `경로 ${draft.editingKey} 점 순서 다시 그리기` : "새 경로"}</h3>
      <Note>도면에서 점을 순서대로 누르세요. 연속한 점 사이는 직선이며 길이는 저장하면 서버가 계산합니다.</Note>
      <FieldGrid>
        <TextField label="경로 이름" value={draft.key} placeholder={key} error={dupKey ? "같은 이름의 경로가 있습니다." : undefined} onChange={(e) => onChange({ ...draft, key: e.target.value })} />
        <SelectField
          label="출발 포트"
          value={draft.fromPortId}
          onChange={(e) => {
            const p = pointOfPort(doc, e.target.value);
            onChange({ ...draft, fromPortId: e.target.value, points: draft.points.length === 0 && p ? [p] : draft.points });
          }}
        >
          <PortOptions assets={assets} />
        </SelectField>
        <SelectField label="도착 포트" value={draft.toPortId} onChange={(e) => onChange({ ...draft, toPortId: e.target.value })}>
          <PortOptions assets={assets} />
        </SelectField>
        <ModeField value={draft.mode} onChange={(m) => onChange({ ...draft, mode: m })} />
      </FieldGrid>
      <p aria-label="고른 점 순서">점 순서: {draft.points.length ? draft.points.join(" → ") : "(아직 없음)"}</p>
      {hints.length > 0 && (
        <ul>
          {hints.map((h) => (
            <li key={h}>⚠ {h}</li>
          ))}
        </ul>
      )}
      <FilterBar>
        <Button onClick={() => onChange({ ...draft, points: draft.points.slice(0, -1) })} disabled={draft.points.length === 0}>
          마지막 점 빼기
        </Button>
        {toPoint && draft.points.length > 0 && draft.points[draft.points.length - 1] !== toPoint && (
          <Button onClick={() => onChange({ ...draft, points: [...draft.points, toPoint] })}>도착 포트의 점({toPoint})으로 끝내기</Button>
        )}
        <Button
          variant="primary"
          disabled={!ready}
          onClick={() => {
            const old = draft.editingKey ? doc.routes.find((r) => r.key === draft.editingKey) : undefined;
            const route: LayoutRoute = { key, fromPortId: draft.fromPortId, toPortId: draft.toPortId, mode: draft.mode, points: draft.points, attributes: old?.attributes ?? {} };
            onDone({ doc: upsertRoute(doc, route, draft.editingKey ?? undefined), key });
          }}
        >
          {draft.editingKey ? "점 순서 바꾸기" : "경로 만들기"}
        </Button>
        <Button onClick={onCancel}>취소</Button>
      </FilterBar>
    </section>
  );
}

/** 선택한 점·배치·경로·포트의 속성. 숫자는 입력 그대로 두고 서버가 반올림한다. 빈칸은 "모름". */
export function SelectionPanel({
  doc,
  saved,
  target,
  assets,
  editable,
  errors,
  onChange,
  onSelect,
  onRedrawRoute,
}: {
  doc: LayoutDoc;
  saved: Schemas["LayoutVersionOut"];
  target: Target;
  assets: LayoutAssets;
  editable: boolean;
  errors: DocErrors;
  onChange: (d: LayoutDoc) => void;
  onSelect: (t: Target | null) => void;
  onRedrawRoute: (r: LayoutRoute) => void;
}) {
  const [kind, id] = [target.slice(0, target.indexOf(":")), target.slice(target.indexOf(":") + 1)];
  const [rename, setRename] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const close = (
    <Button onClick={() => onSelect(null)} aria-label="선택 해제">
      닫기
    </Button>
  );

  if (kind === "point") {
    const pt = doc.points.find((p) => p.key === id);
    if (!pt) return <StateNotice kind="empty" title={`점 ${id}이(가) 없습니다`} action={close} />;
    const use = pointUsage(doc, pt.key);
    const mapped = doc.portPoints.filter((m) => m.pointKey === pt.key);
    const err = (f: string) => errors[`point:${pt.key}.${f}`];
    return (
      <section aria-label={`점 ${pt.key} 속성`}>
        <h3>점 {pt.key}</h3>
        <FieldGrid>
          <TextField
            label="점 이름"
            value={rename ?? pt.key}
            disabled={!editable}
            error={renameError ?? err("key")}
            hint="바꾸면 포트 연결·경로도 새 이름을 따라갑니다(Enter 또는 칸을 벗어나면 적용)"
            onChange={(e) => setRename(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            onBlur={() => {
              if (rename === null) return;
              const next = renamePoint(doc, pt.key, rename);
              if (!next) return setRenameError(rename.trim() ? "같은 이름의 점이 있습니다." : "점 이름이 비었습니다.");
              setRename(null);
              setRenameError(null);
              onChange(next);
              onSelect(`point:${rename.trim()}`);
            }}
          />
          <TextField label="x(m)" value={pt.x} disabled={!editable} error={err("x")} onChange={(e) => onChange(patchPoint(doc, pt.key, { x: e.target.value }))} />
          <TextField label="y(m)" value={pt.y} disabled={!editable} error={err("y")} onChange={(e) => onChange(patchPoint(doc, pt.key, { y: e.target.value }))} />
        </FieldGrid>
        <h4>이 점에 연결된 포트</h4>
        {mapped.length === 0 ? (
          <Note>연결된 포트가 없습니다.</Note>
        ) : (
          <ul>
            {mapped.map((m) => (
              <li key={m.portId}>
                {portText(assets.portById.get(m.portId), m.portId)}{" "}
                {editable && <Button onClick={() => onChange(mapPort(doc, m.portId, ""))}>연결 풀기</Button>}
              </li>
            ))}
          </ul>
        )}
        {editable && (
          <SelectField label="포트 연결" value="" onChange={(e) => e.target.value && onChange(mapPort(doc, e.target.value, pt.key))} hint="다른 점에 연결된 포트를 고르면 이 점으로 옮깁니다(포트당 점 하나)">
            <PortOptions assets={assets} />
          </SelectField>
        )}
        <FilterBar>
          {editable && (
            <Button
              onClick={() => {
                onChange(removePoint(doc, pt.key));
                onSelect(null);
              }}
            >
              점 삭제{use.ports || use.routes.length ? `(포트 ${use.ports}개 연결 해제, 경로 ${use.routes.join("·") || "없음"}에서 빠짐)` : ""}
            </Button>
          )}
          {close}
        </FilterBar>
      </section>
    );
  }

  if (kind === "placement") {
    const pl = doc.placements.find((p) => p.assetId === id);
    const a = assets.byId.get(id);
    const name = a ? `${a.code} ${a.name}` : `자산 ${id.slice(0, 8)}`;
    if (!pl) return <StateNotice kind="empty" title={`${name}은(는) 배치되지 않았습니다`} action={close} />;
    const err = (f: string) => errors[`placement:${id}.${f}`];
    const set = (patch: Parameters<typeof patchPlacement>[2]) => onChange(patchPlacement(doc, id, patch));
    return (
      <section aria-label={`배치 ${name} 속성`}>
        <h3>
          배치 {name} <span>({a?.kind === "equipment" ? "설비" : "공간"})</span>
        </h3>
        <FieldGrid>
          <TextField label="중심 x(m)" value={pl.x} disabled={!editable} error={err("x")} onChange={(e) => set({ x: e.target.value })} />
          <TextField label="중심 y(m)" value={pl.y} disabled={!editable} error={err("y")} onChange={(e) => set({ y: e.target.value })} />
          <TextField label="가로(m)" value={pl.width} disabled={!editable} error={err("width")} hint={pl.width.trim() ? "x 방향, 회전 전" : "모름(비움) — 도면에는 표식으로 그립니다"} onChange={(e) => set({ width: e.target.value })} />
          <TextField label="세로(m)" value={pl.height} disabled={!editable} error={err("height")} hint={pl.height.trim() ? "y 방향, 회전 전" : "모름(비움)"} onChange={(e) => set({ height: e.target.value })} />
          <TextField label="회전(도)" value={pl.rotation} disabled={!editable} error={err("rotation")} hint={pl.rotation.trim() ? "중심 기준 시계 방향 +" : "모름(비움) — 도면에는 0도로 그립니다"} onChange={(e) => set({ rotation: e.target.value })} />
        </FieldGrid>
        {Object.keys(pl.attributes).length > 0 && (
          <details>
            <summary>원본 값(attributes)</summary>
            <Note>가져온 원본 값을 그대로 보입니다(화면 계산에는 쓰지 않음). 예: source는 왼쪽 위 기준 x·y·가로·세로, inside는 소속 공간 원문 표기.</Note>
            <ul aria-label="원본 값">
              {Object.entries(pl.attributes).map(([k, val]) => (
                <li key={k}>
                  <code>{k}</code>: {typeof val === "object" && val !== null ? Object.entries(val as Record<string, unknown>).map(([kk, vv]) => `${kk}=${String(vv)}`).join(" · ") : String(val)}
                </li>
              ))}
            </ul>
          </details>
        )}
        <h4>포트 → 점</h4>
        {(a?.ports ?? []).length === 0 ? (
          <Note>이 자산에는 포트가 없습니다.</Note>
        ) : (
          <FieldGrid>
            {a!.ports.map((port) => (
              <SelectField key={port.id} label={`${port.port_key} ${roleText(port.role)} 점`} value={pointOfPort(doc, port.id)} disabled={!editable} onChange={(e) => onChange(mapPort(doc, port.id, e.target.value))}>
                <option value="">연결 안 함</option>
                {doc.points.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.key} ({p.x}, {p.y})
                  </option>
                ))}
              </SelectField>
            ))}
          </FieldGrid>
        )}
        <FilterBar>
          {editable && (
            <Button
              onClick={() => {
                onChange(removePlacement(doc, id));
                onSelect(null);
              }}
            >
              배치에서 빼기
            </Button>
          )}
          {close}
        </FilterBar>
      </section>
    );
  }

  if (kind === "route") {
    const r = doc.routes.find((x) => x.key === id);
    if (!r) return <StateNotice kind="empty" title={`경로 ${id}이(가) 없습니다`} action={close} />;
    const savedRoute = saved.routes.find((x) => x.route_key === r.key);
    const unchanged = savedRoute && savedRoute.from_port_id === r.fromPortId && savedRoute.to_port_id === r.toPortId && savedRoute.points.join() === r.points.join();
    const upd = (patch: Partial<LayoutRoute>) => onChange(upsertRoute(doc, { ...r, ...patch }, r.key));
    return (
      <section aria-label={`경로 ${r.key} 속성`}>
        <h3>경로 {r.key}</h3>
        <FieldGrid>
          <SelectField label="출발 포트" value={r.fromPortId} disabled={!editable} onChange={(e) => upd({ fromPortId: e.target.value })}>
            <PortOptions assets={assets} />
          </SelectField>
          <SelectField label="도착 포트" value={r.toPortId} disabled={!editable} onChange={(e) => upd({ toPortId: e.target.value })}>
            <PortOptions assets={assets} />
          </SelectField>
          <ModeField value={r.mode} disabled={!editable} onChange={(m) => upd({ mode: m })} />
        </FieldGrid>
        <p>점 순서: {r.points.join(" → ")}</p>
        {errors[`route:${r.key}.points`] && <p role="alert">{errors[`route:${r.key}.points`]}</p>}
        <p>길이: {unchanged ? `${savedRoute.length_m} m(서버 계산)` : "저장하면 서버가 계산합니다"}</p>
        <FilterBar>
          {editable && <Button onClick={() => onRedrawRoute(r)}>점 순서 다시 그리기</Button>}
          {editable && (
            <Button
              onClick={() => {
                onChange(removeRoute(doc, r.key));
                onSelect(null);
              }}
            >
              경로 삭제
            </Button>
          )}
          {close}
        </FilterBar>
      </section>
    );
  }

  // 포트(검증 오류가 포트를 가리킬 때)
  const info = assets.portById.get(id);
  return (
    <section aria-label={`포트 ${portText(info, id)} 속성`}>
      <h3>포트 {portText(info, id)}</h3>
      <SelectField label="연결할 점" value={pointOfPort(doc, id)} disabled={!editable} onChange={(e) => onChange(mapPort(doc, id, e.target.value))}>
        <option value="">연결 안 함</option>
        {doc.points.map((p) => (
          <option key={p.key} value={p.key}>
            {p.key}
          </option>
        ))}
      </SelectField>
      <FilterBar>{close}</FilterBar>
    </section>
  );
}

/** 표 보기 + 엑셀 붙여 넣기 + 배치 안 된 자산. 표의 "선택"을 누르면 도면에서 그 항목을 고른다. */
export function LayoutTables({
  doc,
  saved,
  assets,
  editable,
  selected,
  onSelect,
  onChange,
  onPlace,
}: {
  doc: LayoutDoc;
  saved: Schemas["LayoutVersionOut"];
  assets: LayoutAssets;
  editable: boolean;
  selected: Target | null;
  onSelect: (t: Target) => void;
  onChange: (d: LayoutDoc) => void;
  onPlace: (assetId: string) => void;
}) {
  const [pointText, setPointText] = useState("");
  const [placeText, setPlaceText] = useState("");
  const [pasteMsg, setPasteMsg] = useState<{ ok: string; errors: string[] } | null>(null);
  const [toPlace, setToPlace] = useState("");
  const placed = new Set(doc.placements.map((p) => p.assetId));
  const unplaced = assets.assets.filter((a) => !placed.has(a.id) && !a.archived_at);
  const savedLen = new Map(saved.routes.map((r) => [r.route_key, r]));
  const pick = (t: Target, label: string) => (
    <Button onClick={() => onSelect(t)} aria-label={`${label} 선택`} aria-pressed={selected === t}>
      선택
    </Button>
  );
  const portsOf = (key: string) =>
    doc.portPoints
      .filter((m) => m.pointKey === key)
      .map((m) => portText(assets.portById.get(m.portId), m.portId))
      .join(", ");

  const pointCols: Column<LayoutDoc["points"][number]>[] = [
    { key: "key", header: "점", render: (p) => p.key },
    { key: "x", header: "x(m)", align: "end", render: (p) => p.x },
    { key: "y", header: "y(m)", align: "end", render: (p) => p.y },
    { key: "ports", header: "연결된 포트", render: (p) => portsOf(p.key) },
    { key: "pick", header: "", render: (p) => pick(`point:${p.key}`, `점 ${p.key}`) },
  ];
  const placeCols: Column<LayoutDoc["placements"][number]>[] = [
    { key: "asset", header: "설비·공간", render: (p) => { const a = assets.byId.get(p.assetId); return a ? `${a.code} ${a.name}` : p.assetId.slice(0, 8); } },
    { key: "x", header: "중심 x(m)", align: "end", render: (p) => p.x },
    { key: "y", header: "중심 y(m)", align: "end", render: (p) => p.y },
    { key: "w", header: "가로", align: "end", render: (p) => unknownText(p.width, " m") },
    { key: "h", header: "세로", align: "end", render: (p) => unknownText(p.height, " m") },
    { key: "r", header: "회전", align: "end", render: (p) => unknownText(p.rotation, "°") },
    { key: "pick", header: "", render: (p) => pick(`placement:${p.assetId}`, `배치 ${assets.byId.get(p.assetId)?.code ?? p.assetId.slice(0, 8)}`) },
  ];
  const routeCols: Column<LayoutDoc["routes"][number]>[] = [
    { key: "key", header: "경로", render: (r) => r.key },
    { key: "from", header: "출발", render: (r) => portText(assets.portById.get(r.fromPortId), r.fromPortId) },
    { key: "to", header: "도착", render: (r) => portText(assets.portById.get(r.toPortId), r.toPortId) },
    { key: "mode", header: "운반 방식", render: (r) => modeText(r.mode) },
    { key: "pts", header: "점 순서", render: (r) => r.points.join(" → ") },
    {
      key: "len",
      header: "길이(m)",
      align: "end",
      render: (r) => {
        const s = savedLen.get(r.key);
        return s && s.points.join() === r.points.join() ? s.length_m : "저장 후 계산";
      },
    },
    { key: "pick", header: "", render: (r) => pick(`route:${r.key}`, `경로 ${r.key}`) },
  ];

  return (
    <>
      <h3>점</h3>
      {doc.points.length === 0 ? <Note>점이 없습니다. 도면의 "점 추가"나 아래 붙여 넣기로 만듭니다.</Note> : <DataTable caption="점 목록" columns={pointCols} rows={doc.points} getRowKey={(p) => p.key} currentRowKey={selected?.startsWith("point:") ? selected.slice(6) : undefined} />}
      <h3>배치</h3>
      {doc.placements.length === 0 ? <Note>배치한 설비·공간이 없습니다.</Note> : <DataTable caption="배치 목록" columns={placeCols} rows={doc.placements} getRowKey={(p) => p.assetId} wrapCells />}
      {editable && unplaced.length > 0 && (
        <FilterBar>
          <SelectField label={`배치 안 된 설비·공간(${unplaced.length}개)`} value={toPlace} onChange={(e) => setToPlace(e.target.value)}>
            <option value="">(고르기)</option>
            {unplaced.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} {a.name}
              </option>
            ))}
          </SelectField>
          <Button
            disabled={!toPlace}
            onClick={() => {
              onPlace(toPlace);
              setToPlace("");
            }}
          >
            도면 가운데에 배치
          </Button>
        </FilterBar>
      )}
      <h3>경로</h3>
      {doc.routes.length === 0 ? <Note>경로가 없습니다. 도면의 "경로 그리기"로 만듭니다.</Note> : <DataTable caption="경로 목록" columns={routeCols} rows={doc.routes} getRowKey={(r) => r.key} wrapCells />}

      {editable && (
        <details>
          <summary>엑셀에서 붙여 넣기</summary>
          <Note>엑셀에서 칸을 복사해 붙여 넣으면 됩니다(탭 또는 쉼표로 구분, 첫 줄이 제목이면 건너뜀). 같은 이름·코드가 있으면 값을 바꾸고 없으면 추가합니다. 반영한 뒤 "내용 저장"을 눌러야 서버에 저장됩니다.</Note>
          <TextAreaField label="점 붙여 넣기(이름, x, y)" value={pointText} rows={4} placeholder={"P1\t10.5\t3.2\nP2\t20\t3.2"} onChange={(e) => setPointText(e.target.value)} />
          <Button
            disabled={!pointText.trim()}
            onClick={() => {
              const r = pastePoints(doc, pointText);
              onChange(r.doc);
              setPasteMsg({ ok: `점 ${r.added}개 추가, ${r.updated}개 변경`, errors: r.errors });
              if (r.errors.length === 0) setPointText("");
            }}
          >
            점 반영
          </Button>
          <TextAreaField label="배치 붙여 넣기(자산 코드, 중심 x, 중심 y, 가로, 세로, 회전 — 뒤 셋은 비우면 모름)" value={placeText} rows={4} placeholder={"EQ-001\t12\t8\t4\t2\t0"} onChange={(e) => setPlaceText(e.target.value)} />
          <Button
            disabled={!placeText.trim()}
            onClick={() => {
              const r = pastePlacements(doc, placeText, assets.idByCode);
              onChange(r.doc);
              setPasteMsg({ ok: `배치 ${r.added}개 추가, ${r.updated}개 변경`, errors: r.errors });
              if (r.errors.length === 0) setPlaceText("");
            }}
          >
            배치 반영
          </Button>
          {pasteMsg && (
            <div role="status" aria-label="붙여 넣기 결과">
              <p>{pasteMsg.ok}</p>
              {pasteMsg.errors.length > 0 && (
                <ul>
                  {pasteMsg.errors.map((e) => (
                    <li key={e}>⚠ {e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </details>
      )}
    </>
  );
}
