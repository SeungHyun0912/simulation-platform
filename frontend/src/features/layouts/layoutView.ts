import type { Schemas } from "../../shared/api/types";

/** 포트 역할(열린 문자열): 아는 값만 한국어로, 나머지는 원문 */
export const PORT_ROLE_LABELS: Record<string, string> = { IN: "투입", OUT: "산출", ACCESS: "접근" };
export const roleText = (role: string) => (PORT_ROLE_LABELS[role] ? `${PORT_ROLE_LABELS[role]}(${role})` : role);

/** 운반 방식 제안값(열린 문자열, 비우면 정하지 않음) */
export const MODE_SUGGESTIONS: { value: string; label: string }[] = [
  { value: "forklift", label: "지게차(forklift)" },
  { value: "amr", label: "AMR(amr)" },
  { value: "manual", label: "수동(manual)" },
];
export const modeText = (mode: string) => (mode === "" ? "정하지 않음" : (MODE_SUGGESTIONS.find((m) => m.value === mode)?.label ?? mode));

/** 모르는 값(null·빈칸)은 "모름" — 0과 다르다 */
export const unknownText = (v: string, unit: string) => (v.trim() === "" ? "모름" : `${v}${unit}`);

export const portText = (info: { port: Schemas["PortOut"]; asset: Schemas["AssetOut"] } | undefined, portId: string) =>
  info ? `${info.asset.code} ${info.port.port_key}(${PORT_ROLE_LABELS[info.port.role] ?? info.port.role})` : `포트 ${portId.slice(0, 8)}`;

export type HeaderDraft = { name: string; notes: string; canvasW: string; canvasH: string; bgUrl: string; bgWpx: string; bgHpx: string; bgMpp: string };

export function headerOf(v: Schemas["LayoutVersionOut"]): HeaderDraft {
  const bg = (v.attributes?.background ?? {}) as Record<string, unknown>;
  const t = (x: unknown) => (x === null || x === undefined ? "" : String(x));
  return {
    name: v.name ?? "",
    notes: v.notes ?? "",
    canvasW: v.canvas_width_m ?? "",
    canvasH: v.canvas_height_m ?? "",
    bgUrl: t(bg.url),
    bgWpx: t(bg.width_px),
    bgHpx: t(bg.height_px),
    bgMpp: t(bg.m_per_px),
  };
}

const NUM = /^\d+(\.\d+)?$/;

export function validateHeader(h: HeaderDraft): Record<string, string> {
  const e: Record<string, string> = {};
  for (const [k, label] of [
    ["canvasW", "도면 가로"],
    ["canvasH", "도면 세로"],
  ] as const)
    if (h[k].trim() && (!NUM.test(h[k].trim()) || Number(h[k]) <= 0)) e[k] = `${label}는 0보다 큰 숫자(m)이거나 비워 둡니다(모름).`;
  for (const [k, label] of [
    ["bgWpx", "이미지 가로(px)"],
    ["bgHpx", "이미지 세로(px)"],
    ["bgMpp", "픽셀당 m"],
  ] as const)
    if (h[k].trim() && (!NUM.test(h[k].trim()) || Number(h[k]) <= 0)) e[k] = `${label}는 0보다 큰 숫자이거나 비워 둡니다.`;
  if (h.bgUrl.trim() && !/^https?:\/\//i.test(h.bgUrl.trim())) e.bgUrl = "http:// 또는 https:// 주소만 쓸 수 있습니다.";
  return e;
}

/** 바뀐 머리 필드만 PATCH. background는 약속 키(url·width_px·height_px·m_per_px)만 바꾸고 attributes의 다른 키는 그대로 둔다. */
export function headerPatch(server: Schemas["LayoutVersionOut"], h: HeaderDraft): Schemas["LayoutVersionPatch"] {
  const base = headerOf(server);
  const patch: Schemas["LayoutVersionPatch"] = {};
  const opt = (x: string) => (x.trim() === "" ? null : x.trim());
  if (h.name !== base.name) patch.name = opt(h.name);
  if (h.notes !== base.notes) patch.notes = opt(h.notes);
  if (h.canvasW !== base.canvasW) patch.canvas_width_m = opt(h.canvasW);
  if (h.canvasH !== base.canvasH) patch.canvas_height_m = opt(h.canvasH);
  if (h.bgUrl !== base.bgUrl || h.bgWpx !== base.bgWpx || h.bgHpx !== base.bgHpx || h.bgMpp !== base.bgMpp) {
    const rest = { ...(server.attributes ?? {}) };
    delete rest.background;
    const bg: Record<string, unknown> = {};
    if (h.bgUrl.trim()) bg.url = h.bgUrl.trim();
    if (h.bgWpx.trim()) bg.width_px = Number(h.bgWpx);
    if (h.bgHpx.trim()) bg.height_px = Number(h.bgHpx);
    if (h.bgMpp.trim()) bg.m_per_px = Number(h.bgMpp);
    patch.attributes = Object.keys(bg).length ? { ...rest, background: bg } : rest;
  }
  return patch;
}
