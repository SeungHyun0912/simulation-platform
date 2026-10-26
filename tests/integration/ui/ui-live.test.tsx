// UI→API→DB 실제 연동 확인(A안: jsdom에 앱을 렌더링하고 전용 서버·전용 DB에 연결). 브라우저 렌더링 검증은 아니다.
// Mock(가짜 서버)을 쓰지 않는다. fetch는 실제 네트워크로 나가며 사용자 식별 헤더만 붙인다.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../../../frontend/tests/renderApp";
import { API, PROJECT_A, RUN, USERS, clientAs } from "./live";

const PROJECT_B = "c649e3ed-2918-5229-a63e-67aef6b4308b";
const slow = { timeout: 10_000 };

function realFetch(user: keyof typeof USERS): typeof fetch {
  return ((url: string, init: RequestInit = {}) =>
    fetch(url.startsWith("/api/v1") ? `${API}${url.slice("/api/v1".length)}` : url, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), "X-Debug-User": USERS[user] },
    })) as typeof fetch;
}

describe("T1·T9 서버를 쓸 수 없을 때", () => {
  it("API 모드에서 서버 연결이 끊기면 오류를 표시하고 정적 예시로 대체하지 않는다", async () => {
    const dead = (() => Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch;
    renderApp(`/projects/${PROJECT_A}/assets`, { source: "api", fetchImpl: dead });
    await screen.findByText("서버에 연결하지 못했습니다", {}, slow);
    expect(screen.queryByText(/예시 데이터입니다/)).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("권한 없는 프로젝트는 '찾을 수 없음'으로 표시하고 데이터를 그리지 않는다", async () => {
    renderApp(`/projects/${PROJECT_A}/assets`, { source: "api", fetchImpl: realFetch("other_org" as never) });
    await screen.findByText(/찾을 수 없습니다|인증이 필요합니다/, {}, slow);
    expect(screen.queryByText("EQ-001")).not.toBeInTheDocument();
  });
});

describe("T2 프로젝트 전환 시 이전 프로젝트 데이터 잔류 없음", () => {
  it("A 프로젝트 자산을 본 뒤 B로 이동하면 A의 자산이 화면에 남지 않는다", async () => {
    const { router } = renderApp(`/projects/${PROJECT_A}/assets`, { source: "api", fetchImpl: realFetch("admin") });
    await screen.findByText("EQ-002", {}, slow); // A에만 있는 설비(B에는 EQ-001 한 건뿐)
    expect(screen.queryByText(/예시 데이터입니다/)).not.toBeInTheDocument();
    await router.navigate(`/projects/${PROJECT_B}/assets`);
    await waitFor(() => expect(screen.queryByText("EQ-002")).not.toBeInTheDocument(), slow);
    await screen.findByText("EQ-001", {}, slow);
    expect(screen.queryByText("EQ-003")).not.toBeInTheDocument();
  });
});

describe("T3 조회 전용 사용자", () => {
  it("viewer는 자산 상세에서 기본 정보를 저장할 수 없고 서버도 거부한다", async () => {
    const admin = clientAs("admin");
    const eq = (await admin.get<any>(`/projects/${PROJECT_A}/assets`, { query: { q: "EQ-001" } })).body.data.find((a: any) => a.code === "EQ-001");
    renderApp(`/projects/${PROJECT_A}/assets/${eq.id}`, { source: "api", fetchImpl: realFetch("viewer") });
    await screen.findByRole("heading", { level: 1, name: /EQ-001/ }, slow);
    await waitFor(() => expect(screen.getByText(/내 역할: 조회자|내 역할: 뷰어/)).toBeInTheDocument(), slow);
    expect(screen.getByRole("button", { name: "기본 정보 저장" })).toBeDisabled();
    // 화면 제한과 별개로 서버가 최종 판정한다.
    const r = await fetch(`${API}/projects/${PROJECT_A}/assets/${eq.id}`, {
      method: "PATCH",
      headers: { "X-Debug-User": USERS.viewer, "If-Match": `"${eq.row_version}"`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "[INT] viewer 시도" }),
    });
    expect(r.status).toBe(403);
  });
});

describe("T6 동시 수정 충돌에서 사용자 입력 보호", () => {
  it("다른 곳에서 먼저 저장하면 412 충돌 안내가 뜨고 내 입력은 유지되며 서버 값은 덮어쓰이지 않는다", async () => {
    const user = userEvent.setup();
    const admin = clientAs("admin");
    const created = await admin.post<any>(`/projects/${PROJECT_A}/assets`, {
      body: { kind: "equipment", code: `INT${RUN}-UI`, name: "[INT] UI 충돌 시험", equipment: { equipment_type: "extruder" } },
    });
    const asset = created.body.data;
    renderApp(`/projects/${PROJECT_A}/assets/${asset.id}`, { source: "api", fetchImpl: realFetch("admin") });
    await screen.findByRole("heading", { level: 1, name: new RegExp(asset.code) }, slow);
    await waitFor(() => expect(screen.getByText(/내 역할: 관리자/)).toBeInTheDocument(), slow);

    // 화면에서 이름을 고치는 동안 다른 사용자가 먼저 저장한다.
    const nameInput = screen.getByLabelText("이름");
    await user.clear(nameInput);
    await user.type(nameInput, "내가 입력한 이름"); // 주의: userEvent.type은 "["를 특수 키 문법으로 해석한다.
    await admin.patch(`/projects/${PROJECT_A}/assets/${asset.id}`, { body: { name: "[INT] 다른 사용자가 먼저 저장" }, ifMatch: created.version! });

    await user.click(screen.getByRole("button", { name: "기본 정보 저장" }));
    await screen.findByText(/다른 사용자가 먼저 수정했습니다/, {}, slow);
    expect(within(document.body).getByLabelText("이름")).toHaveValue("내가 입력한 이름"); // 입력 보존
    const server = (await admin.get<any>(`/projects/${PROJECT_A}/assets/${asset.id}`)).body.data;
    expect(server.name).toBe("[INT] 다른 사용자가 먼저 저장"); // 마지막 저장 승리가 아니다.
  });
});
