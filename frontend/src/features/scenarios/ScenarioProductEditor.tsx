import { Button } from "../../shared/components/Button";
import { CheckboxField, SelectField, TextField } from "../../shared/components/Fields";
import { FieldGrid, Note } from "../../shared/components/Layout";
import type { ProductView } from "../products/productView";
import { useProcessDetail, useProcessVersions } from "../processes/queries";
import {
  emptyArrival,
  newKey,
  SCENARIO_LIMITS,
  type ArrivalEdit,
  type ScenarioProductEdit,
} from "./scenarioView";

const RESIDUAL_SCOPES: Record<string, string> = { machine: "설비", product: "제품", operation: "작업", lot: "로트" };
const EQUIPMENT_HOLD: Record<string, string> = { hold_for_operation: "작업이 끝날 때까지 설비 점유" };
/** 서버가 승인 이력이 있는 버전만 받는다(SCN-REF-002): 승인됨 또는 승인 후 대체됨 */
const USABLE = new Set(["approved", "superseded"]);

type Props = {
  projectId: string;
  index: number;
  product: ScenarioProductEdit;
  products: ProductView[];
  onChange: (next: ScenarioProductEdit) => void;
  onRemove: () => void;
  /** 화면 경로(`products.<key>.…`) → 오류 메시지(클라이언트 검증 + 서버 422) */
  errors: Record<string, string>;
};

/** 시나리오의 제품 하나: 승인된 공정 버전, 우선순위, 도착(원자재 입고), 이 시나리오에서만 쓰는 가정. */
export function ScenarioProductEditor({ projectId, index, product: p, products, onChange, onRemove, errors }: Props) {
  const k = `products.${p.key}`;
  const name = `제품 ${index + 1}`;
  const versions = useProcessVersions(projectId, p.productId);
  const detail = useProcessDetail(projectId, p.productId, p.processVersionId);
  const nodes = detail.status === "success" ? detail.data.graph.doc.nodes.filter((n) => n.kind === "operation") : [];
  const set = (patch: Partial<ScenarioProductEdit>) => onChange({ ...p, ...patch });
  const setArrival = (key: string, patch: Partial<ArrivalEdit>) => set({ arrivals: p.arrivals.map((a) => (a.key === key ? { ...a, ...patch } : a)) });
  const setAssume = (patch: Partial<ScenarioProductEdit["assumptions"]>) => set({ assumptions: { ...p.assumptions, ...patch } });

  const usable = versions.status === "success" ? versions.data.filter((v) => USABLE.has(v.status)) : [];
  const nodeOption = (n: { node_key: string; label: string }) => (
    <option key={n.node_key} value={n.node_key}>
      {n.label} ({n.node_key})
    </option>
  );

  return (
    <fieldset aria-label={name}>
      <legend>{name}</legend>
      <FieldGrid>
        <SelectField
          label={`${name} 제품`}
          value={p.productId}
          error={errors[`${k}.productId`]}
          onChange={(e) => set({ productId: e.target.value, processVersionId: "" })}
        >
          <option value="">선택하세요</option>
          {products.map((x) => (
            <option key={x.id} value={x.id}>
              {x.code} {x.name}
            </option>
          ))}
          {p.productId && !products.some((x) => x.id === p.productId) && <option value={p.productId}>알 수 없는 제품 ({p.productId.slice(0, 8)})</option>}
        </SelectField>
        <SelectField
          label={`${name} 공정 버전`}
          hint="승인된(또는 승인 후 대체된) 버전만 고를 수 있습니다. 시나리오는 이 버전의 그래프를 실행 입력으로 고정합니다."
          value={p.processVersionId}
          error={errors[`${k}.processVersionId`]}
          disabled={!p.productId}
          onChange={(e) => set({ processVersionId: e.target.value, assumptions: { ...p.assumptions, transport: [], residualScope: [] } })}
        >
          <option value="">{p.productId ? "선택하세요" : "제품을 먼저 선택하세요"}</option>
          {usable.map((v) => (
            <option key={v.id} value={v.id}>
              v{v.versionNo} ({v.status === "approved" ? "승인" : "대체됨"})
            </option>
          ))}
          {p.processVersionId && !usable.some((v) => v.id === p.processVersionId) && <option value={p.processVersionId}>공정 버전 ({p.processVersionId.slice(0, 8)})</option>}
        </SelectField>
        <TextField
          label={`${name} 우선순위`}
          hint={`1~${SCENARIO_LIMITS.priorityMax}의 정수. 목록 순서는 같은 시각의 처리 순서입니다.`}
          inputMode="numeric"
          value={p.priority}
          error={errors[`${k}.priority`]}
          onChange={(e) => set({ priority: e.target.value })}
        />
      </FieldGrid>
      {versions.status === "success" && p.productId && usable.length === 0 && (
        <Note>이 제품에는 승인된 공정 버전이 없습니다. 공정을 승인한 뒤 고를 수 있습니다.</Note>
      )}

      <h4>도착(원자재 입고)</h4>
      <Note>
        시나리오 시작 기준 분입니다. 길이와 무게는 서로 환산하지 않으며 둘 중 하나는 있어야 합니다. 길이가 없는 원자재(예: 2t·3.3t)는 무게만 입력하세요.
      </Note>
      {errors[`${k}.arrivals`] && <p role="alert">{errors[`${k}.arrivals`]}</p>}
      {p.arrivals.map((a, i) => {
        const an = `${name} 도착 ${i + 1}`;
        const ak = `${k}.arrivals.${a.key}`;
        return (
          <fieldset key={a.key} aria-label={an}>
            <FieldGrid>
              <TextField label={`${an} 시각(분)`} inputMode="decimal" value={a.atMin} error={errors[`${ak}.atMin`]} onChange={(e) => setArrival(a.key, { atMin: e.target.value })} />
              <TextField label={`${an} 개수`} inputMode="numeric" value={a.count} error={errors[`${ak}.count`]} onChange={(e) => setArrival(a.key, { count: e.target.value })} />
              <TextField
                label={`${an} 길이(m)`}
                hint="비우면 길이 없음"
                inputMode="decimal"
                value={a.lengthM}
                error={errors[`${ak}.lengthM`] ?? errors[`${ak}.amount`]}
                onChange={(e) => setArrival(a.key, { lengthM: e.target.value })}
              />
              <TextField
                label={`${an} 무게(kg)`}
                hint="비우면 무게 없음"
                inputMode="decimal"
                value={a.weightKg}
                error={errors[`${ak}.weightKg`]}
                onChange={(e) => setArrival(a.key, { weightKg: e.target.value })}
              />
              <TextField label={`${an} 로트`} hint="선택" value={a.lot} error={errors[`${ak}.lot`]} onChange={(e) => setArrival(a.key, { lot: e.target.value })} />
            </FieldGrid>
            <Button onClick={() => set({ arrivals: p.arrivals.filter((x) => x.key !== a.key) })} aria-label={`${an} 삭제`}>
              도착 삭제
            </Button>
          </fieldset>
        );
      })}
      <div>
        <Button onClick={() => set({ arrivals: [...p.arrivals, emptyArrival()] })} aria-label={`${name} 도착 추가`}>
          도착 추가
        </Button>
      </div>

      <h4>가정(이 시나리오에서만)</h4>
      <Note>공정의 미정 값을 이 시나리오에서만 정합니다. 공정 원본은 바뀌지 않으며, 하나라도 쓰면 아래 "가정 사유"가 필요합니다.</Note>
      <FieldGrid>
        <SelectField
          label={`${name} 설비 점유 정책`}
          hint="정하지 않으면 서버 기본값(작업이 끝날 때까지 점유)을 씁니다."
          value={p.assumptions.equipmentHold}
          onChange={(e) => setAssume({ equipmentHold: e.target.value })}
        >
          <option value="">정하지 않음</option>
          {Object.entries(EQUIPMENT_HOLD).map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
          {p.assumptions.equipmentHold && !(p.assumptions.equipmentHold in EQUIPMENT_HOLD) && (
            <option value={p.assumptions.equipmentHold}>{`알 수 없는 값 (${p.assumptions.equipmentHold})`}</option>
          )}
        </SelectField>
      </FieldGrid>
      <CheckboxField
        label={`${name} 용량을 모르는 대기 공간은 제한 없이 대기한다고 가정`}
        checked={p.assumptions.unboundedBuffers}
        onChange={(e) => setAssume({ unboundedBuffers: e.target.checked })}
      />

      <h5>수동 운반 시간(분)</h5>
      {p.assumptions.transport.map((t, i) => {
        const tn = `${name} 운반 ${i + 1}`;
        const tk = `${k}.transport.${t.key}`;
        return (
          <fieldset key={t.key} aria-label={tn}>
            <FieldGrid>
              <SelectField
                label={`${tn} 단계`}
                value={t.nodeKey}
                error={errors[`${tk}.nodeKey`]}
                onChange={(e) => setAssume({ transport: p.assumptions.transport.map((x) => (x.key === t.key ? { ...x, nodeKey: e.target.value } : x)) })}
              >
                <option value="">선택하세요</option>
                {nodes.map(nodeOption)}
                {t.nodeKey && !nodes.some((n) => n.node_key === t.nodeKey) && <option value={t.nodeKey}>{t.nodeKey}</option>}
              </SelectField>
              <TextField
                label={`${tn} 분`}
                hint="0도 명시해야 합니다"
                inputMode="decimal"
                value={t.minutes}
                error={errors[`${tk}.minutes`]}
                onChange={(e) => setAssume({ transport: p.assumptions.transport.map((x) => (x.key === t.key ? { ...x, minutes: e.target.value } : x)) })}
              />
            </FieldGrid>
            <Button onClick={() => setAssume({ transport: p.assumptions.transport.filter((x) => x.key !== t.key) })} aria-label={`${tn} 삭제`}>
              운반 시간 삭제
            </Button>
          </fieldset>
        );
      })}
      <div>
        <Button onClick={() => setAssume({ transport: [...p.assumptions.transport, { key: newKey("tr"), nodeKey: "", minutes: "" }] })} aria-label={`${name} 운반 시간 추가`}>
          운반 시간 추가
        </Button>
      </div>

      <h5>잔량 범위</h5>
      {p.assumptions.residualScope.map((r, i) => {
        const rn = `${name} 잔량 ${i + 1}`;
        const rk = `${k}.residual.${r.key}`;
        return (
          <fieldset key={r.key} aria-label={rn}>
            <FieldGrid>
              <SelectField
                label={`${rn} 단계`}
                value={r.nodeKey}
                error={errors[`${rk}.nodeKey`]}
                onChange={(e) => setAssume({ residualScope: p.assumptions.residualScope.map((x) => (x.key === r.key ? { ...x, nodeKey: e.target.value } : x)) })}
              >
                <option value="">선택하세요</option>
                {nodes.map(nodeOption)}
                {r.nodeKey && !nodes.some((n) => n.node_key === r.nodeKey) && <option value={r.nodeKey}>{r.nodeKey}</option>}
              </SelectField>
              <SelectField
                label={`${rn} 범위`}
                hint="공정에 잔량 범위가 미정일 때만 적용됩니다."
                value={r.scope}
                error={errors[`${rk}.scope`]}
                onChange={(e) => setAssume({ residualScope: p.assumptions.residualScope.map((x) => (x.key === r.key ? { ...x, scope: e.target.value } : x)) })}
              >
                <option value="">선택하세요</option>
                {Object.entries(RESIDUAL_SCOPES).map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
                {r.scope && !(r.scope in RESIDUAL_SCOPES) && <option value={r.scope}>{`알 수 없는 값 (${r.scope})`}</option>}
              </SelectField>
            </FieldGrid>
            <Button onClick={() => setAssume({ residualScope: p.assumptions.residualScope.filter((x) => x.key !== r.key) })} aria-label={`${rn} 삭제`}>
              잔량 범위 삭제
            </Button>
          </fieldset>
        );
      })}
      <div>
        <Button onClick={() => setAssume({ residualScope: [...p.assumptions.residualScope, { key: newKey("rs"), nodeKey: "", scope: "" }] })} aria-label={`${name} 잔량 범위 추가`}>
          잔량 범위 추가
        </Button>
      </div>

      <div>
        <Button onClick={onRemove} aria-label={`${name} 삭제`}>
          제품 삭제
        </Button>
      </div>
    </fieldset>
  );
}
