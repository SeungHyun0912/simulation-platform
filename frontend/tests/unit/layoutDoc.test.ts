import {
  addPoint,
  insertRoutePoint,
  nearestPoint,
  removeRoutePointAt,
  unusedPoints,
  backgroundOf,
  coord,
  extentOf,
  mapPort,
  pastePlacements,
  pastePoints,
  removePoint,
  renamePoint,
  saveIssueTarget,
  toContentIn,
  validateDoc,
  validationIssueTarget,
  type LayoutDoc,
} from "../../src/features/layouts/layoutDoc";
import { headerOf, headerPatch } from "../../src/features/layouts/layoutView";
import { round1 } from "../fakeLayouts";

const doc = (): LayoutDoc => ({
  points: [
    { key: "P1", x: "1.0", y: "1.0", attributes: {} },
    { key: "P2", x: "5.0", y: "1.0", attributes: {} },
    { key: "P3", x: "5.0", y: "4.0", attributes: {} },
  ],
  placements: [{ assetId: "a1", x: "2.0", y: "2.0", width: "", height: "3.0", rotation: "", attributes: {} }],
  portPoints: [{ portId: "port-out", pointKey: "P2" }],
  routes: [{ key: "R1", fromPortId: "port-out", toPortId: "port-in", mode: "", points: ["P1", "P2", "P3"], attributes: {} }],
});

describe("배치판 편집 모델", () => {
  it("모르는 값(빈칸)은 null로 보내고 0과 구분한다", () => {
    const body = toContentIn(doc());
    expect(body.placements![0]).toMatchObject({ width_m: null, height_m: "3.0", rotation_deg: null });
    expect(body.routes![0]!.mode).toBeNull();
    const zero = toContentIn({ ...doc(), placements: [{ ...doc().placements[0]!, rotation: "0" }] });
    expect(zero.placements![0]!.rotation_deg).toBe("0");
  });

  it("새 점은 P{다음 번호}이고 끌기 좌표는 0 이상·소수 첫째 자리다", () => {
    const r = addPoint(doc(), 3.14159, -2);
    expect(r.key).toBe("P4");
    expect(r.doc.points[3]).toMatchObject({ x: "3.1", y: "0.0" });
    expect(coord(9.05)).toBe("9.1");
  });

  it("점 이름을 바꾸면 포트 매핑·경로도 따라가고, 이미 있는 이름으로는 바꾸지 않는다", () => {
    const next = renamePoint(doc(), "P2", "PX")!;
    expect(next.portPoints[0]!.pointKey).toBe("PX");
    expect(next.routes[0]!.points).toEqual(["P1", "PX", "P3"]);
    expect(renamePoint(doc(), "P2", "P3")).toBeNull();
    expect(renamePoint(doc(), "P2", " ")).toBeNull();
  });

  it("점을 지우면 매핑을 풀고 경로에서 빼며 연달아 같은 점이 되면 합친다", () => {
    const d = { ...doc(), routes: [{ ...doc().routes[0]!, points: ["P1", "P2", "P1"] }] };
    const next = removePoint(d, "P2");
    expect(next.portPoints).toHaveLength(0);
    expect(next.routes[0]!.points).toEqual(["P1"]);
    expect(validateDoc(next)["route:R1.points"]).toMatch(/2개 이상/);
  });

  it("포트는 점 하나에만 매핑되고 빈 값이면 매핑을 푼다", () => {
    const d = mapPort(doc(), "port-out", "P3");
    expect(d.portPoints).toEqual([{ portId: "port-out", pointKey: "P3" }]);
    expect(mapPort(d, "port-out", "").portPoints).toHaveLength(0);
  });

  it("화면 입력 검사: 중복 이름·숫자 아님·음수·0 크기·회전 범위", () => {
    const d = doc();
    d.points.push({ key: "P1", x: "-1", y: "a", attributes: {} });
    d.placements[0] = { ...d.placements[0]!, width: "0", rotation: "360" };
    const e = validateDoc(d);
    expect(e["point:P1.key"]).toMatch(/같은 이름/);
    expect(e["point:P1.x"]).toBeDefined();
    expect(e["placement:a1.width"]).toBeDefined();
    expect(e["placement:a1.rotation"]).toBeDefined();
  });

  it("저장 오류는 보낸 본문 순번으로, 검증 오류는 key 경로로 대상을 찾는다", () => {
    const body = toContentIn(doc());
    expect(saveIssueTarget("/routes/0/points/1", body)).toBe("route:R1");
    expect(saveIssueTarget("/points/2/x_m", body)).toBe("point:P3");
    expect(saveIssueTarget("/port_points/0/point_key", body)).toBe("port:port-out");
    expect(saveIssueTarget("/routes/9", body)).toBeNull();
    expect(validationIssueTarget("/routes/R1")).toBe("route:R1");
    expect(validationIssueTarget("/placements/a1")).toBe("placement:a1");
    expect(validationIssueTarget("/port_points/port-out")).toBe("port:port-out");
    expect(validationIssueTarget("/canvas_width_m")).toBeNull();
  });

  it("엑셀 붙여 넣기: 제목 줄은 건너뛰고, 같은 이름은 바꾸고 새 이름은 더하며, 틀린 줄은 알린다", () => {
    const r = pastePoints(doc(), "이름\tx\ty\nP1\t9\t9\nP9\t2.5\t3\n잘못\tx\t1");
    expect(r.updated).toBe(1);
    expect(r.added).toBe(1);
    expect(r.errors).toHaveLength(1);
    expect(r.doc.points.find((p) => p.key === "P1")).toMatchObject({ x: "9", y: "9" });
    const pl = pastePlacements(doc(), "EQ-001,1,2,3,4,\nNO-1,1,1", new Map([["EQ-001", "a1"]]));
    expect(pl.updated).toBe(1);
    expect(pl.doc.placements[0]).toMatchObject({ x: "1", y: "2", width: "3", height: "4", rotation: "" });
    expect(pl.errors[0]).toMatch(/NO-1/);
  });

  it("배경 도면: http(s)만, m_per_px가 없으면 도면 가로 ÷ 이미지 가로, 축척을 모르면 깔지 않는다", () => {
    expect(backgroundOf({ background: { url: "https://x/a.png", width_px: 1000, height_px: 500, m_per_px: 0.05 } }, null).bg).toEqual({ url: "https://x/a.png", widthM: 50, heightM: 25 });
    expect(backgroundOf({ background: { url: "https://x/a.png", width_px: 800, height_px: 400 } }, "40.0").bg).toMatchObject({ widthM: 40, heightM: 20 });
    expect(backgroundOf({ background: { url: "https://x/a.png", width_px: 800, height_px: 400 } }, null).reason).toMatch(/축척/);
    expect(backgroundOf({ background: { url: "javascript:alert(1)" } }, null)).toMatchObject({ bg: null, reason: expect.stringMatching(/http/) });
    expect(backgroundOf({}, null)).toEqual({ bg: null, reason: null });
  });

  it("그릴 범위: 도면 크기가 있으면 그것, 없으면 점·배치를 담는 범위(최소 10 m)", () => {
    expect(extentOf(doc(), "40", "20", null)).toEqual({ w: 40, h: 20 });
    expect(extentOf(doc(), null, null, null)).toEqual({ w: 10, h: 10 });
  });

  it("머리 수정: 바뀐 필드만 보내고 background는 약속 키만 바꾼다", () => {
    const server = { name: "A", notes: null, canvas_width_m: "40.0", canvas_height_m: null, attributes: { other: 1 } } as never;
    const h = headerOf(server);
    expect(headerPatch(server, h)).toEqual({});
    expect(headerPatch(server, { ...h, canvasH: "20", bgUrl: "https://x/a.png", bgWpx: "800" })).toEqual({
      canvas_height_m: "20",
      attributes: { other: 1, background: { url: "https://x/a.png", width_px: 800 } },
    });
  });

  it("가짜 서버 반올림은 ROUND_HALF_UP(계약 예: 9.05 → 9.1)", () => {
    expect(round1("9.05")).toBe("9.1");
    expect(round1("9.04")).toBe("9.0");
    expect(round1("12")).toBe("12.0");
  });
});

describe("경로 점 편집(참고 라벨러 방식)", () => {
  it("구간에 점을 끼워 넣되 양옆과 같은 점이면 넣지 않는다", () => {
    expect(insertRoutePoint(doc(), "R1", 1, "P9").routes[0]!.points).toEqual(["P1", "P9", "P2", "P3"]);
    expect(insertRoutePoint(doc(), "R1", 1, "P2").routes[0]!.points).toEqual(["P1", "P2", "P3"]);
  });
  it("경로에서 점을 빼면 연달아 같은 점을 합치고 점 자체는 남긴다", () => {
    const d = { ...doc(), routes: [{ ...doc().routes[0]!, points: ["P1", "P2", "P1", "P3"] }] };
    const next = removeRoutePointAt(d, "R1", 1);
    expect(next.routes[0]!.points).toEqual(["P1", "P3"]);
    expect(next.points).toHaveLength(3);
  });
  it("쓰이지 않는 점과 가장 가까운 점(허용 거리 안)을 찾는다", () => {
    const d = { ...doc(), routes: [{ ...doc().routes[0]!, points: ["P1", "P2"] }] };
    expect(unusedPoints(d)).toEqual(["P3"]);
    expect(nearestPoint(doc(), 5.2, 1.1, 0.5)).toBe("P2");
    expect(nearestPoint(doc(), 9, 9, 0.5)).toBeNull();
  });
});

describe("key 규칙(Backend 안내: 1~64자, 배치판 안에서 유일)", () => {
  it("64자를 넘는 점·경로 이름은 저장 전에 막는다", () => {
    const long = "P".repeat(65);
    const d = { ...doc(), points: [...doc().points, { key: long, x: "1", y: "1", attributes: {} }], routes: [{ ...doc().routes[0]!, key: "R".repeat(65) }] };
    const e = validateDoc(d);
    expect(e[`point:${long}.key`]).toMatch(/64자 이하/);
    expect(e[`route:${"R".repeat(65)}.key`]).toMatch(/64자 이하/);
    expect(validateDoc({ ...doc(), points: [{ key: "P".repeat(64), x: "1", y: "1", attributes: {} }] })[`point:${"P".repeat(64)}.key`]).toBeUndefined();
  });
});
