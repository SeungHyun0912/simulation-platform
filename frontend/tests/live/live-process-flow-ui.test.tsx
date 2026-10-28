import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderApp } from "../renderApp";

/**
 * 실제 서버 공정으로 플로우차트를 그려 보는 읽기 전용 확인(GET만 호출, 아무것도 저장하지 않는다).
 *   $env:LIVE_API="http://127.0.0.1:8000/api/v1"; pnpm test:live
 * 프로젝트 `DEMO-WIRE`의 제품 P01~P06(직선·분기·운반 단계·완제품 milestone)의 최신 공정 버전이 노드·간선 수만큼 그려지는지 본다.
 */
const LIVE = process.env.LIVE_API;
const ADMIN = "e5a11d34-ddab-5412-bf1b-a0daeb2bb81a";
const slow = { timeout: 20_000 };

function realFetch(): typeof fetch {
  const base = (LIVE ?? "").replace(/\/+$/, "");
  return ((url: string, init: RequestInit = {}) =>
    fetch(url.startsWith("/api/v1") ? `${base}${url.slice("/api/v1".length)}` : url, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), "X-Debug-User": ADMIN },
    })) as typeof fetch;
}
async function json<T>(path: string): Promise<T> {
  return ((await (await realFetch()(`/api/v1${path}`)).json()) as { data: T }).data;
}

type Product = { id: string; code: string; latest_process_version: { id: string } | null };
let projectId = "";
let products: Product[] = [];

beforeAll(async () => {
  if (!LIVE) return;
  const me = await json<{ projects: { id: string; code: string }[] }>("/me");
  projectId = me.projects.find((p) => p.code === "DEMO-WIRE")?.id ?? "";
  if (projectId) products = (await json<Product[]>(`/projects/${projectId}/products?limit=50`)).filter((p) => p.latest_process_version);
});

describe.skipIf(!LIVE)("실제 서버 공정으로 그린 플로우차트 (읽기 전용)", () => {
  it("DEMO-WIRE의 모든 제품: 서버가 준 노드·간선 수만큼 그리고 완제품 지정 노드를 표시한다", async (ctx) => {
    if (products.length === 0) return ctx.skip();
    for (const p of products) {
      const v = p.latest_process_version!.id;
      const g = await json<{ nodes: unknown[]; edges: unknown[]; completion_node_id: string | null }>(`/projects/${projectId}/process-versions/${v}/graph`);
      const { unmount } = renderApp(`/projects/${projectId}/products/${p.id}/flow`, { source: "api", fetchImpl: realFetch() });
      await screen.findByRole("heading", { level: 1, name: new RegExp(`${p.code} 공정 플로우차트`) }, slow);
      await waitFor(() => expect(screen.getAllByRole("button", { name: /^(시작\(원자재\)|대기 공간|공정 단계|합류|완료 기준|끝\(완제품\)) / })).toHaveLength(g.nodes.length), slow);
      expect(screen.getAllByRole("button", { name: /^간선 .+ → / })).toHaveLength(g.edges.length);
      if (g.completion_node_id) expect(screen.getAllByRole("button", { name: /\(완제품 지정\)/ })).toHaveLength(1);
      unmount();
    }
  });

  it("프로젝트 전체 공정: 공정이 있는 모든 제품을 한 화면에 그리고 여러 제품이 함께 쓰는 설비를 보인다", async (ctx) => {
    if (products.length === 0) return ctx.skip();
    renderApp(`/projects/${projectId}/flow/all`, { source: "api", fetchImpl: realFetch() });
    for (const p of products) await screen.findByRole("group", { name: `${p.code} 공정 도식` }, slow);
    expect(screen.getByRole("table", { name: "여러 제품이 함께 쓰는 설비·공간" })).toBeInTheDocument();
  });

  it("분기가 있는 공정(P04)에서도 노드를 눌러 단계 편집 패널이 열린다(읽기만, 저장하지 않음)", async (ctx) => {
    const p04 = products.find((p) => p.code === "P04");
    if (!p04) return ctx.skip();
    renderApp(`/projects/${projectId}/products/${p04.id}/flow`, { source: "api", fetchImpl: realFetch() });
    const ops = await screen.findAllByRole("button", { name: /^공정 단계 / }, slow);
    fireEvent.click(ops[0]!);
    expect(await screen.findByRole("heading", { name: /단계 편집:/ }, slow)).toBeInTheDocument();
  });
});
