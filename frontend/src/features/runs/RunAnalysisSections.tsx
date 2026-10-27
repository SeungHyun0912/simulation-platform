import { useState } from "react";
import type { CSSProperties } from "react";
import { classifyError } from "../../shared/api/errors";
import type { Schemas } from "../../shared/api/types";
import { Button } from "../../shared/components/Button";
import { DataTable, type Column } from "../../shared/components/DataTable";
import { CheckboxField, SelectField } from "../../shared/components/Fields";
import { FilterBar, Note, Section } from "../../shared/components/Layout";
import { QueryErrorNotice } from "../../shared/components/QueryErrorNotice";
import { StateNotice } from "../../shared/components/StateNotice";
import badge from "../../shared/components/VersionStatusBadge.module.css";
import {
  ASSET_STATE_LABELS,
  BOTTLENECK_KINDS,
  bucketTitle,
  evidenceLines,
  kindTitle,
  LEVEL_LABELS,
  locationText,
  numberText,
  percentText,
  stateText,
  WINDOW_TEXT,
  type Bottleneck,
} from "./analysisView";
import { useAssetStates, useAssetTimeline, useRunBottlenecks } from "./queries";
import styles from "./RunAnalysis.module.css";

const NO_RESULT = "이 실행에는 공식 결과가 없습니다. 끝까지 실행된 시도가 있어야 합니다(대기·실행 중이거나 실패·취소로 끝난 실행은 제공하지 않습니다).";

function ResultError({ error, subject, onRetry }: { error: unknown; subject: string; onRetry: () => void }) {
  if (classifyError(error) === "state") return <StateNotice kind="empty" title={`${subject}이(가) 없습니다`}>{NO_RESULT}</StateNotice>;
  return <QueryErrorNotice error={error} subject={subject} onRetry={onRetry} />;
}

const QUALITY: Record<string, string> = {
  censored: "고정 지평선에서 끊긴 관측입니다. 지평선 이후는 판정에 들어가지 않습니다.",
  incomplete: "끝까지 실행되지 못한 결과(입력 부족·이벤트 한도 등)입니다. 판정을 완료된 결과처럼 해석하지 마세요.",
};

export function LevelBadge({ level }: { level: string }) {
  const v = LEVEL_LABELS[level] ?? { text: level, mark: "?", tone: "neutral" };
  return (
    <span className={`${badge.badge} ${badge[v.tone]}`}>
      <span aria-hidden="true">{v.mark}</span>
      {v.text}
    </span>
  );
}

/** 병목 한 건: 순위·수준·위치·멈춘 양·종류 안 비율·설명, 근거는 펼쳐 본다. */
export function FindingItem({ f }: { f: Bottleneck }) {
  return (
    <li className={styles.finding} aria-label={`병목 ${f.rank}위 ${kindTitle(f.kind)} ${locationText(f.location)}`}>
      <div className={styles.findingHead}>
        <strong>{f.rank}위</strong>
        <LevelBadge level={f.level} />
        <span>{locationText(f.location)}</span>
        <span className={styles.amount} title={`${f.stalled_item_min} 작업물·분`}>
          멈춘 양 {numberText(f.stalled_item_min, 0)} 작업물·분
        </span>
        <span className={styles.muted}>같은 종류 안 {percentText(f.share)} · 종류 안 {f.rank_in_kind}위</span>
      </div>
      <p>{f.explanation}</p>
      <details>
        <summary>근거 수치</summary>
        <ul className={styles.evidence}>
          {evidenceLines(f.evidence as Record<string, unknown>).map((e) => (
            <li key={e.key}>
              {e.label}: {e.text}
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

/**
 * 병목 요약(0.12.0): 사용자가 정한 세 기준(저장 공간 부족·설비 가동 대기·대기 자재 적체)으로 "멈춰 있는 곳"을 종류별로 보여 준다.
 * 종류끼리는 멈춘 시간이 겹치므로 합산하지 않는다. 판정의 한계(limitations)와 기준값(thresholds)을 함께 보인다(계약 요구).
 */
/** 종류마다 처음에 보이는 건수(나머지는 펼쳐 본다) */
const KIND_PREVIEW = 3;

export function RunBottlenecksSection({ projectId, runId, enabled }: { projectId: string; runId: string; enabled: boolean }) {
  const q = useRunBottlenecks(projectId, runId, enabled);
  const [openKinds, setOpenKinds] = useState<ReadonlySet<string>>(new Set());
  return (
    <Section id="sec-bottlenecks" title="병목">
      {!enabled && <StateNotice kind="empty" title="실행이 끝나면 병목을 볼 수 있습니다" />}
      {enabled && q.status === "pending" && <StateNotice kind="loading" />}
      {enabled && q.status === "error" && <ResultError error={q.error} subject="병목 요약" onRetry={q.retry} />}
      {enabled && q.status === "success" && (
        <>
          {QUALITY[q.data.quality_status] && (
            <StateNotice kind="conflict" title="불완전한 관측">
              {QUALITY[q.data.quality_status]}
            </StateNotice>
          )}
          <p className={styles.headline}>{q.data.headline}</p>
          <Note>관측 시간 {numberText(q.data.observed.min, 0)}분 · 멈춘 양은 작업물 수 × 멈춘 분(작업물·분)이며 종류가 다르면 합산하지 않습니다.</Note>
          <StateNotice kind="contract-pending" title="이 판정의 한계">
            <ul className={styles.limits}>
              {q.data.limitations.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </StateNotice>
          {q.data.findings.length === 0 && <StateNotice kind="empty" title="기준을 넘는 병목이 없습니다" />}
          {[...BOTTLENECK_KINDS, ...unknownKinds(q.data.findings)].map((k) => {
            const list = q.data.findings.filter((f) => f.kind === k.kind).sort((a, b) => a.rank_in_kind - b.rank_in_kind);
            if (list.length === 0) return null;
            const open = openKinds.has(k.kind);
            const shown = open ? list : list.slice(0, KIND_PREVIEW);
            return (
              <section key={k.kind} className={styles.kindGroup} aria-label={`병목 종류: ${k.title}`}>
                <h3 className={styles.kindTitle}>
                  {k.title} <span className={styles.muted}>({list.length}건)</span>
                </h3>
                <p className={styles.muted}>{k.desc}</p>
                <ul className={styles.findings}>
                  {shown.map((f) => (
                    <FindingItem key={`${f.kind}-${f.rank}`} f={f} />
                  ))}
                </ul>
                {list.length > KIND_PREVIEW && (
                  <p>
                    <Button
                      aria-expanded={open}
                      onClick={() =>
                        setOpenKinds((cur) => {
                          const n = new Set(cur);
                          if (open) n.delete(k.kind);
                          else n.add(k.kind);
                          return n;
                        })
                      }
                    >
                      {open ? "접기" : `${k.title} 모두 보기(${list.length}건)`}
                    </Button>
                  </p>
                )}
              </section>
            );
          })}
          <p className={styles.muted}>
            판정 기준값:{" "}
            {Object.entries(q.data.thresholds)
              .map(([k, v]) => `${THRESHOLD_TEXT[k] ?? k} ${String(v)}`)
              .join(" · ")}{" "}
            (정의 버전 {q.data.definition_version})
          </p>
        </>
      )}
    </Section>
  );
}

const THRESHOLD_TEXT: Record<string, string> = {
  pileup_min_peak_items: "적체 최소 개수",
  level_high_share: "높음 비율 이상",
  level_medium_share: "중간 비율 이상",
  min_stalled_item_min: "최소 멈춘 양(작업물·분)",
};
const unknownKinds = (fs: Bottleneck[]) =>
  [...new Set(fs.map((f) => f.kind as string))].filter((k) => !BOTTLENECK_KINDS.some((x) => x.kind === k)).map((k) => ({ kind: k, title: k, desc: "" }));

/* ---------------- 설비 타임라인 ---------------- */

type Timeline = Schemas["AssetTimelineOut"];
type Bucket = Schemas["AssetTimelineBucketOut"];

const bucketDetail = (b: Bucket) =>
  `처리 ${numberText(b.processing_min, 0)}분 · 준비 ${numberText(b.setup_min, 0)}분 · 예약 ${numberText(b.reserved_min, 0)}분 · 막힘 ${numberText(b.blocked_min, 0)}분 · 유휴 ${numberText(b.idle_min, 0)}분`;

/**
 * 설비 타임라인(0.13.0): 설비별 구간 가동률 표(칸 진하기 = 가동률, 숫자 함께 표시)와 고른 설비의 상태 간트.
 * 일 단위는 크므로 주 단위로 시작하고 설비 20대씩 더 받는다. 공정이 후보로 둔 설비 전체를 보여 주며 쓰이지 않은 설비는 숨길 수 있다.
 */
export function RunAssetTimelineSection({ projectId, runId, enabled }: { projectId: string; runId: string; enabled: boolean }) {
  const [window, setWindow] = useState("week");
  const [usedOnly, setUsedOnly] = useState(true);
  const [picked, setPicked] = useState<{ asset: Timeline; bucket: number } | null>(null);
  const q = useAssetTimeline(projectId, runId, window, enabled);

  const rows = q.status === "success" ? q.data.items.filter((a) => !usedOnly || a.used) : [];
  const cols = q.status === "success" ? Math.max(0, ...q.data.items.map((a) => a.buckets.length)) : 0;
  const hidden = q.status === "success" ? q.data.items.length - rows.length : 0;
  const name = (a: Timeline) => `${a.asset_code ?? a.asset_id.slice(0, 8)}${a.asset_name ? ` ${a.asset_name}` : ""}`;
  const heatCols: Column<Timeline>[] = [
    {
      key: "asset",
      header: "설비",
      render: (a) => (
        <span className={a.used ? "" : styles.unused}>
          {name(a)}
          {!a.used && <span className={styles.muted}> · 이 실행에서 쓰이지 않음(전 구간 유휴)</span>}
        </span>
      ),
    },
    { key: "uses", header: "사용처", render: (a) => a.uses.map((u) => `${u.product_code ?? u.process_version_id.slice(0, 8)} ${u.step_label ?? u.step_key}`).join(", ") },
    ...Array.from({ length: cols }, (_, i): Column<Timeline> => ({
      key: `b${i}`,
      header: bucketTitle(window, i),
      align: "end",
      render: (a) => {
        const b = a.buckets[i];
        if (!b) return "";
        const u = b.utilization === null ? 0 : Math.max(0, Math.min(1, Number(b.utilization)));
        const sel = picked?.asset.asset_id === a.asset_id && picked.bucket === i;
        return (
          <span className={[styles.cell, sel ? styles.cellSelected : ""].join(" ")} style={{ "--u": u } as CSSProperties} title={bucketDetail(b)}>
            {percentText(b.utilization, 0)}
          </span>
        );
      },
    })),
    {
      key: "action",
      header: "상태",
      render: (a) => (
        <Button disabled={!a.used} onClick={() => setPicked({ asset: a, bucket: 0 })} aria-label={`${name(a)} 상태 보기`}>
          상태 보기
        </Button>
      ),
    },
  ];

  return (
    <Section id="sec-timeline" title="설비 타임라인">
      <Note>
        구간별 설비 가동률(처리 시간 ÷ 구간 길이)입니다. 24시간 연속 기준이며(가동 달력 없음) 지게차·AMR 같은 운반 설비는 엔진이 자원으로 다루지 않아 없습니다. "상태 보기"를 누르면 그 설비의 처리·준비·막힘 구간을 봅니다.
      </Note>
      {enabled && (
        <FilterBar>
          <SelectField
            label="구간 단위"
            hint="일 단위는 데이터가 커서 주 단위로 시작합니다."
            value={window}
            onChange={(e) => {
              setWindow(e.target.value);
              setPicked(null);
            }}
          >
            {["week", "day", "month", "run"].map((w) => (
              <option key={w} value={w}>
                {WINDOW_TEXT[w]}
              </option>
            ))}
          </SelectField>
          <CheckboxField label="이 실행에서 쓰인 설비만" checked={usedOnly} onChange={(e) => setUsedOnly(e.target.checked)} />
        </FilterBar>
      )}
      {!enabled && <StateNotice kind="empty" title="실행이 끝나면 설비 타임라인을 볼 수 있습니다" />}
      {enabled && q.status === "pending" && <StateNotice kind="loading" />}
      {enabled && q.status === "error" && <ResultError error={q.error} subject="설비 타임라인" onRetry={q.retry} />}
      {enabled && q.status === "success" && (
        <>
          {rows.length === 0 ? (
            <StateNotice kind="empty" title="표시할 설비가 없습니다">
              {hidden > 0 ? `쓰이지 않은 설비 ${hidden}대를 숨겼습니다.` : ""}
            </StateNotice>
          ) : (
            <div className={styles.heat}>
              <DataTable caption="설비별 구간 가동률" columns={heatCols} rows={rows} getRowKey={(a) => a.asset_id} currentRowKey={picked?.asset.asset_id} />
            </div>
          )}
          {hidden > 0 && rows.length > 0 && <p className={styles.muted}>쓰이지 않은 설비 {hidden}대를 숨겼습니다.</p>}
          {q.data.hasMore && (
            <p>
              <Button onClick={q.data.fetchMore} disabled={q.data.fetchingMore}>
                {q.data.fetchingMore ? "불러오는 중…" : "설비 더 보기"}
              </Button>
            </p>
          )}
          {picked && (
            <AssetGantt
              projectId={projectId}
              runId={runId}
              asset={picked.asset}
              name={name(picked.asset)}
              window={window}
              bucket={picked.bucket}
              onBucket={(i) => setPicked({ asset: picked.asset, bucket: i })}
              onClose={() => setPicked(null)}
            />
          )}
        </>
      )}
    </Section>
  );
}

const GANTT = { w: 960, h: 44, pad: 8, axis: 16 } as const;
const SEGMENT_COLS: Column<Schemas["AssetStateSegmentOut"]>[] = [
  { key: "state", header: "상태", render: (s) => stateText(s.state) },
  { key: "start", header: "시작(분)", align: "end", render: (s) => numberText(s.start.min) },
  { key: "end", header: "끝(분)", align: "end", render: (s) => numberText(s.end.min) },
  { key: "dur", header: "길이(분)", align: "end", render: (s) => numberText(s.duration_min) },
  { key: "where", header: "제품·단계", render: (s) => [s.product_code, s.step_key].filter(Boolean).join(" ") },
];
const STATE_ORDER = ["PROCESSING", "SETUP", "RESERVED", "BLOCKED", "IDLE"];

/** 설비 하나의 상태 간트(고른 구간만 잘라 받는다). 막대는 색과 함께 표로도 같은 내용을 보인다. */
function AssetGantt({
  projectId,
  runId,
  asset,
  name,
  window,
  bucket,
  onBucket,
  onClose,
}: {
  projectId: string;
  runId: string;
  asset: Timeline;
  name: string;
  window: string;
  bucket: number;
  onBucket: (i: number) => void;
  onClose: () => void;
}) {
  const b = asset.buckets[bucket] ?? asset.buckets[0];
  const range = b ? { from: b.start.min, to: b.end.min } : null;
  const q = useAssetStates(projectId, runId, asset.asset_id, range);
  const start = b ? Number(b.start.min) : 0;
  const span = b ? Math.max(1e-9, Number(b.end.min) - start) : 1;
  const x = (m: string) => GANTT.pad + ((Math.min(Math.max(Number(m), start), start + span) - start) / span) * (GANTT.w - GANTT.pad * 2);

  return (
    <section aria-label={`${name} 상태 간트`}>
      <h3>{name} 상태</h3>
      <FilterBar>
        <SelectField label="간트 구간" value={String(bucket)} onChange={(e) => onBucket(Number(e.target.value))}>
          {asset.buckets.map((x2, i) => (
            <option key={i} value={i}>
              {bucketTitle(window, i)} ({numberText(x2.start.min, 0)}~{numberText(x2.end.min, 0)}분, 가동 {percentText(x2.utilization, 0)})
            </option>
          ))}
        </SelectField>
      </FilterBar>
      {b && <p className={styles.muted}>{bucketDetail(b)}</p>}
      {q.status === "pending" && <StateNotice kind="loading" />}
      {q.status === "error" && <ResultError error={q.error} subject="설비 상태" onRetry={q.retry} />}
      {q.status === "success" &&
        (q.data.items.length === 0 ? (
          <StateNotice kind="empty" title="이 구간에 상태 기록이 없습니다" />
        ) : (
          <>
            <div className={styles.gantt}>
              <svg width={GANTT.w} height={GANTT.h + GANTT.axis} role="img" aria-label={`${name} 상태 막대(아래 표와 같은 내용)`}>
                {q.data.items.map((s, i) => {
                  const x1 = x(s.start.min);
                  const x2 = x(s.end.min);
                  return (
                    <rect key={i} x={x1} y={GANTT.pad} width={Math.max(1, x2 - x1)} height={GANTT.h - GANTT.pad * 2} className={`${styles.seg} ${styles[s.state] ?? styles.RESERVED}`}>
                      <title>{`${stateText(s.state)} ${numberText(s.start.min)}~${numberText(s.end.min)}분${s.product_code ? ` · ${s.product_code}` : ""}${s.step_key ? ` ${s.step_key}` : ""}`}</title>
                    </rect>
                  );
                })}
                <text x={GANTT.pad} y={GANTT.h + GANTT.axis - 4} className={styles.axis}>
                  {numberText(String(start), 0)}분
                </text>
                <text x={GANTT.w - GANTT.pad} y={GANTT.h + GANTT.axis - 4} textAnchor="end" className={styles.axis}>
                  {numberText(String(start + span), 0)}분
                </text>
              </svg>
            </div>
            <ul className={styles.legend} aria-label="상태 범례">
              {STATE_ORDER.map((st) => (
                <li key={st}>
                  <svg className={styles.swatch} aria-hidden="true" viewBox="0 0 10 10">
                    <rect width="10" height="10" className={styles[st]} />
                  </svg>
                  {ASSET_STATE_LABELS[st]}
                </li>
              ))}
            </ul>
            <details>
              <summary>상태 구간 표({q.data.items.length}건{q.data.hasMore ? " 이상" : ""})</summary>
              <DataTable caption={`${name} 상태 구간`} columns={SEGMENT_COLS} rows={q.data.items} getRowKey={(x2) => `${x2.start.exact}-${x2.state}-${x2.operation_id ?? ""}`} />
            </details>
            {q.data.hasMore && (
              <p>
                <Button onClick={q.data.fetchMore} disabled={q.data.fetchingMore}>
                  {q.data.fetchingMore ? "불러오는 중…" : "상태 구간 더 보기"}
                </Button>
              </p>
            )}
          </>
        ))}
      <p>
        <Button onClick={onClose}>간트 닫기</Button>
      </p>
    </section>
  );
}
