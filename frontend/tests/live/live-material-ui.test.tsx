import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../renderApp";

/**
 * 실제 서버 데이터로 재료 화면을 그려 보는 통합 확인. 읽기 구역은 GET만 호출하고, 쓰기 구역(`LIVE_WRITE=1`)은 M-003 하나를 화면으로
 * 편집한 뒤 화면으로 원래 값(규격 미정)으로 되돌린다.
 *   $env:LIVE_API="http://127.0.0.1:8000/api/v1"; $env:LIVE_WRITE="1"; pnpm test:live
 */
const LIVE = process.env.LIVE_API;
const WRITE = process.env.LIVE_WRITE === "1";
const ADMIN = "e5a11d34-ddab-5412-bf1b-a0daeb2bb81a";
const PROJECT_A = "9985bf99-c375-58b0-a776-5a1cc5053585";
const slow = { timeout: 10_000 };

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

type Mat = { id: string; code: string; notes: string | null; row_version: number; default_spec: { length_m: { mode: string; value: string | null }; unit_count: { mode: string; value: number | null } } };
const materialByCode = async (code: string) => (await json<Mat[]>(`/projects/${PROJECT_A}/materials?q=${code}`)).find((m) => m.code === code)!;
const mode = (group: string, name: string) => within(screen.getByRole("group", { name: group })).getByRole("radio", { name });

describe.skipIf(!LIVE)("실제 서버 데이터로 그린 재료 화면 (읽기 전용)", () => {
  it("목록은 서버 값을 미정·해당 없음·확정으로 구분해 그린다", async () => {
    renderApp(`/projects/${PROJECT_A}/materials`, { source: "api", fetchImpl: realFetch() });
    const table = await screen.findByRole("table", { name: "재료 목록" }, slow);
    expect(screen.getByText(/서버에서 불러온 데이터입니다/)).toBeInTheDocument();
    expect(within(table).getByText("M-001").closest("tr")).toHaveTextContent(/\d+ m/);
    expect(within(table).getByText("M-002").closest("tr")).toHaveTextContent("해당 없음");
    expect(within(table).getByText("M-003").closest("tr")).toHaveTextContent("미정");
  });

  it("상세는 기본 정보와 기본 규격 네 값을 서버 값으로 그리고 조회 전용에서는 저장하지 않는다", async () => {
    const m2 = await materialByCode("M-002");
    renderApp(`/projects/${PROJECT_A}/materials/${m2.id}`, { source: "api", fetchImpl: realFetch() });
    await screen.findByRole("heading", { level: 1, name: /M-002/ }, slow);
    await waitFor(() => expect(screen.getByText(/내 역할: 관리자/)).toBeInTheDocument(), slow);
    expect(screen.getByLabelText("기본 규격 단위 수 값")).toHaveValue("3");
    expect(mode("기본 규격 중량", "해당 없음")).toBeChecked();
    expect(screen.getByRole("button", { name: /^저장/ })).toBeDisabled(); // 변경 전에는 저장할 수 없다
  });
});

describe.skipIf(!LIVE || !WRITE)("실제 서버: 화면 조작으로 재료 수정 (M-003 하나, 화면으로 원복)", () => {
  it("규격을 입력해 저장하면 서버가 받아들이고, 미정으로 되돌려 저장하면 원래 상태가 된다", async () => {
    const user = userEvent.setup();
    const before = await materialByCode("M-003");
    expect(before.default_spec.length_m.mode).toBe("unknown"); // 이전 실행이 남긴 값이 없어야 시작한다

    renderApp(`/projects/${PROJECT_A}/materials/${before.id}`, { source: "api", fetchImpl: realFetch() });
    await screen.findByRole("heading", { level: 1, name: /M-003/ }, slow);
    await waitFor(() => expect(screen.getByText(/내 역할: 관리자/)).toBeInTheDocument(), slow);

    await user.click(mode("기본 규격 길이", "값 있음"));
    await user.type(screen.getByLabelText("기본 규격 길이 값"), "1500");
    await user.click(mode("기본 규격 단위 수", "값 있음"));
    await user.type(screen.getByLabelText("기본 규격 단위 수 값"), "2");
    await user.click(screen.getByRole("button", { name: /^저장/ }));
    await screen.findByText("재료 정보를 저장했습니다.", {}, slow);
    const saved = await materialByCode("M-003");
    expect(saved.row_version).toBe(before.row_version + 1);
    expect(saved.default_spec.length_m).toMatchObject({ mode: "known", value: "1500" });
    expect(saved.default_spec.unit_count).toMatchObject({ mode: "known", value: 2 }); // JSON 정수

    // 정리: 화면에서 둘 다 미정으로 되돌려 저장한다(응답의 새 버전을 If-Match로 이어 쓴다)
    await user.click(mode("기본 규격 길이", "미정"));
    await user.click(mode("기본 규격 단위 수", "미정"));
    await user.click(screen.getByRole("button", { name: /^저장/ }));
    await waitFor(async () => expect((await materialByCode("M-003")).row_version).toBe(saved.row_version + 1), slow);
    const after = await materialByCode("M-003");
    expect(after.default_spec.length_m.mode).toBe("unknown");
    expect(after.default_spec.unit_count.mode).toBe("unknown");
    expect(after.notes).toBe(before.notes);
  });
});
