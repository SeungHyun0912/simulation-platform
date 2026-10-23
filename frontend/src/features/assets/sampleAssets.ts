import type { KnownValue } from "../../shared/components/KnownValueInput";
import type { ValidationIssue } from "../../shared/components/ValidationPanel";
import type {
  AssetInfo,
  DispatchRule,
  PortInfo,
  PortPolicy,
  ReleaseRule,
  RevisionDetail,
  RevisionSummary,
} from "./assetView";

/**
 * 정적 예시 데이터. 모양은 계약 0.2.0의 승인 예제(contracts/examples/first-scope)를 따르지만
 * 실제 API 응답이 아니며 실제 기준정보도 아니다. 이름·값은 화면 구조와 상태 표현을 보여 주기 위한 임의 값이다.
 * 실제 연동 시 이 파일의 데이터 대신 API 응답을 어댑터로 변환해 쓴다.
 */
const uuid = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

const unknownCap: KnownValue = { mode: "unknown", value: "", unit: "item" };
const finite = (value: string, unit = "item"): KnownValue => ({ mode: "value", value, unit });
const notAllowed: KnownValue = { mode: "not_allowed", value: "", unit: "item" };
const unlimited: KnownValue = { mode: "unlimited", value: "", unit: "item" };

const DISPATCH_DEFAULT: DispatchRule = {
  mode: "when_destination_available",
  reservation: "unknown",
  waitAtInIfBusy: true,
};
const RELEASE_DEFAULT: ReleaseRule = {
  mode: "when_destination_accepts",
  blockMachineWhileWaiting: "unknown",
};

const summary = (id: string, no: number, status: string, approved = false): RevisionSummary => ({
  id: uuid(id),
  revisionNo: no,
  status,
  approvedAt: approved ? "2026-10-23T00:00:00Z" : null,
});

function equipmentPorts(base: string): PortInfo[] {
  return [
    { id: uuid(`${base}01`), portKey: "IN", role: "IN", label: "IN" },
    { id: uuid(`${base}02`), portKey: "OUT", role: "OUT", label: "OUT" },
  ];
}
function accessPort(base: string): PortInfo[] {
  return [{ id: uuid(`${base}01`), portKey: "ACCESS-01", role: "ACCESS", label: "접근" }];
}

function policies(
  base: string,
  inCap: KnownValue,
  outCap: KnownValue,
  release: ReleaseRule = RELEASE_DEFAULT,
): PortPolicy[] {
  return [
    {
      portId: uuid(`${base}01`),
      portKey: "IN",
      role: "IN",
      bufferCapacity: inCap,
      dispatchRule: DISPATCH_DEFAULT,
      releaseRule: RELEASE_DEFAULT,
    },
    {
      portId: uuid(`${base}02`),
      portKey: "OUT",
      role: "OUT",
      bufferCapacity: outCap,
      dispatchRule: DISPATCH_DEFAULT,
      releaseRule: release,
    },
  ];
}

const asset = (
  p: Partial<AssetInfo> & Pick<AssetInfo, "id" | "code" | "name" | "kind" | "ports">,
): AssetInfo => ({
  sortOrder: 0,
  externalRef: null,
  notes: null,
  equipmentType: null,
  modelName: null,
  spaceType: null,
  archivedAt: null,
  currentRevision: null,
  latestRevision: null,
  rowVersion: 1,
  ...p,
});

const warn = (
  revisionId: string,
  rule_id: string,
  field_path: string,
  message: string,
  resolution?: string,
): ValidationIssue => ({
  severity: "warning",
  rule_id,
  entity_id: revisionId,
  field_path,
  message,
  resolution,
});

export const SAMPLE_ASSETS: AssetInfo[] = [
  asset({
    id: uuid("0a1"),
    code: "EQ-001",
    name: "예시 절연 압출기",
    kind: "equipment",
    sortOrder: 10,
    externalRef: "ERP-0001",
    equipmentType: "extruder",
    modelName: "EX-100",
    ports: equipmentPorts("a1"),
    currentRevision: summary("e0a11", 1, "approved", true),
    latestRevision: summary("e0a12", 2, "draft"),
    rowVersion: 2,
  }),
  asset({
    id: uuid("0a2"),
    code: "EQ-002",
    name: "예시 쉬스 압출기",
    kind: "equipment",
    sortOrder: 20,
    equipmentType: "extruder",
    ports: equipmentPorts("a2"),
    currentRevision: summary("e0a21", 1, "approved", true),
    latestRevision: summary("e0a21", 1, "approved", true),
  }),
  asset({
    id: uuid("0a3"),
    code: "EQ-003",
    name: "예시 편조기",
    kind: "equipment",
    sortOrder: 30,
    equipmentType: "braider",
    ports: equipmentPorts("a3"),
    // 버전이 아직 없는 자산: 용량 설정을 시작하려면 새 버전을 만들어야 한다.
  }),
  asset({
    id: uuid("0a4"),
    code: "EQ-004",
    name: "예시 재권취기",
    kind: "equipment",
    sortOrder: 40,
    equipmentType: "rewinder",
    ports: equipmentPorts("a4"),
    currentRevision: summary("e0a42", 2, "approved", true),
    latestRevision: summary("e0a42", 2, "approved", true),
    rowVersion: 3,
  }),
  asset({
    id: uuid("0b1"),
    code: "ST-001",
    name: "예시 원자재 저장공간",
    kind: "storage",
    sortOrder: 110,
    spaceType: "storage",
    ports: accessPort("b1"),
    latestRevision: summary("e0b11", 1, "draft"),
  }),
  asset({
    id: uuid("0b2"),
    code: "ST-002",
    name: "예시 도킹 A",
    kind: "dock",
    sortOrder: 120,
    spaceType: "dock",
    ports: accessPort("b2"),
    latestRevision: summary("e0b21", 1, "in_review"),
  }),
];

function revision(
  r: Pick<RevisionDetail, "id" | "assetId" | "revisionNo" | "status"> &
    Partial<RevisionDetail>,
): RevisionDetail {
  return {
    storageCapacity: null,
    ports: [],
    issues: [],
    rejectionReason: null,
    approvedAt: null,
    rowVersion: 1,
    ...r,
  };
}

const rid = (s: string) => uuid(s);

/** 자산 id → 버전 목록(최신 버전 먼저) */
export const SAMPLE_REVISIONS: Record<string, RevisionDetail[]> = {
  [uuid("0a1")]: [
    revision({
      id: rid("e0a12"),
      assetId: uuid("0a1"),
      revisionNo: 2,
      status: "draft",
      ports: policies("a1", finite("4"), notAllowed),
      issues: [
        warn(
          rid("e0a12"),
          "VAL-POLICY-001",
          "/ports/0/dispatch_rule/reservation",
          "IN 포트의 이동 중 설비 예약 여부가 미정입니다(OPEN-003).",
          "예약 여부를 확정하거나 시나리오 가정으로 승인하세요.",
        ),
        warn(
          rid("e0a12"),
          "VAL-POLICY-002",
          "/ports/0/release_rule/block_machine_while_waiting",
          "IN 포트 출력이 막힐 때 설비를 점유하는지 미정입니다(OPEN-003).",
          "점유 여부를 확정하거나 시나리오 가정으로 승인하세요.",
        ),
      ],
      rowVersion: 2,
    }),
    revision({
      id: rid("e0a11"),
      assetId: uuid("0a1"),
      revisionNo: 1,
      status: "approved",
      approvedAt: "2026-10-23T00:00:00Z",
      ports: policies("a1", finite("2"), unlimited),
    }),
  ],
  [uuid("0a2")]: [
    revision({
      id: rid("e0a21"),
      assetId: uuid("0a2"),
      revisionNo: 1,
      status: "approved",
      approvedAt: "2026-10-23T00:00:00Z",
      ports: policies("a2", finite("1"), finite("1")),
    }),
  ],
  [uuid("0a4")]: [
    revision({
      id: rid("e0a42"),
      assetId: uuid("0a4"),
      revisionNo: 2,
      status: "approved",
      approvedAt: "2026-10-23T00:00:00Z",
      ports: policies("a4", unknownCap, finite("500", "kg")),
      issues: [
        warn(
          rid("e0a42"),
          "VAL-CAP-002",
          "/ports/1/buffer_capacity/unit",
          "kg 단위 용량은 등록할 수 있지만 현재 실행 엔진은 개(item) 단위만 지원합니다.",
        ),
      ],
      rowVersion: 3,
    }),
    revision({
      id: rid("e0a41"),
      assetId: uuid("0a4"),
      revisionNo: 1,
      status: "superseded",
      approvedAt: "2026-10-23T00:00:00Z",
      ports: policies("a4", finite("3"), finite("3")),
    }),
  ],
  [uuid("0b1")]: [
    revision({
      id: rid("e0b11"),
      assetId: uuid("0b1"),
      revisionNo: 1,
      status: "draft",
      storageCapacity: unknownCap,
      issues: [
        warn(
          rid("e0b11"),
          "VAL-CAP-001",
          "/storage_capacity",
          "저장 용량 값이 미정입니다.",
          "확정값 입력(없으면 대기 불가 선택). 실행 전에 해소해야 합니다.",
        ),
      ],
    }),
  ],
  [uuid("0b2")]: [
    revision({
      id: rid("e0b21"),
      assetId: uuid("0b2"),
      revisionNo: 1,
      status: "in_review",
      // 도킹이라는 이유로 용량을 무제한으로 가정하지 않는다.
      storageCapacity: finite("30"),
      rowVersion: 2,
    }),
  ],
};
