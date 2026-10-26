import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildProjectCreate } from "../../src/features/projects/writer";
import { createFakeServer, errorBody, ORG_ADMIN } from "../fakeApi";
import { renderApp } from "../renderApp";

const slow = { timeout: 8000 };

async function open(server = createFakeServer()) {
  const app = renderApp("/projects/new", { source: "api", fetchImpl: server.fetchImpl });
  await screen.findByLabelText("코드", {}, slow);
  return { server, ...app };
}

async function fill(user: ReturnType<typeof userEvent.setup>, code = "NEW-1") {
  await user.type(screen.getByLabelText("코드"), code);
  await user.type(screen.getByLabelText("이름"), "새 프로젝트");
}

const posts = (s: ReturnType<typeof createFakeServer>) => s.writes().filter((w) => w.path === "/projects");

describe("buildProjectCreate", () => {
  it("공백을 지우고 빈 설명은 보내지 않는다", () => {
    expect(buildProjectCreate({ organizationId: "o", code: " A ", name: " 이름 ", timezone: " Asia/Seoul ", description: "  " })).toEqual({
      organization_id: "o",
      code: "A",
      name: "이름",
      timezone: "Asia/Seoul",
    });
    expect(buildProjectCreate({ organizationId: "o", code: "A", name: "n", timezone: "UTC", description: "설명" }).description).toBe("설명");
  });
});

describe("API 모드: 프로젝트 만들기", () => {
  it("조직 관리자인 조직(/me)만 고를 수 있고 입력 전에는 만들 수 없다", async () => {
    await open();
    expect(screen.getByLabelText("조직")).toHaveValue(ORG_ADMIN); // 관리자 조직이 하나면 미리 선택
    expect(screen.getByRole("button", { name: "프로젝트 만들기" })).toBeDisabled();
    expect(screen.queryByText(/예시/)).not.toBeInTheDocument();
  });

  it("저장하면 POST /projects로 보내고 새 프로젝트의 설비·공간 화면으로 이동한다", async () => {
    const user = userEvent.setup();
    const { server, router } = await open();
    await fill(user);
    await user.click(screen.getByRole("button", { name: "프로젝트 만들기" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/projects\/f{8}-0000-4000-8000-000000009001\/assets$/), slow);
    expect(posts(server)).toHaveLength(1);
    expect(posts(server)[0]!.body).toEqual({ organization_id: ORG_ADMIN, code: "NEW-1", name: "새 프로젝트", timezone: "Asia/Seoul" });
  });

  it("형식 오류가 있으면 보내지 않는다", async () => {
    const user = userEvent.setup();
    const { server } = await open();
    await fill(user);
    await user.clear(screen.getByLabelText("시간대"));
    await user.type(screen.getByLabelText("시간대"), "Not/AZone");
    expect(screen.getByRole("button", { name: "프로젝트 만들기" })).toBeDisabled();
    expect(posts(server)).toHaveLength(0);
  });

  it("코드가 중복이면(409 PROJECT_CODE_CONFLICT) 코드 필드에 연결하고 입력을 유지하며 이동하지 않는다", async () => {
    const user = userEvent.setup();
    const { server, router } = await open();
    await fill(user, "SRV-P1"); // 시드에 이미 있는 코드
    await user.click(screen.getByRole("button", { name: "프로젝트 만들기" }));
    expect((await screen.findAllByText(/이미 사용 중인 코드입니다/, {}, slow)).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("코드")).toHaveValue("SRV-P1");
    expect(screen.getByLabelText("이름")).toHaveValue("새 프로젝트");
    expect(router.state.location.pathname).toBe("/projects/new");
    expect(posts(server)).toHaveLength(1);
    // 코드를 고치면 그 필드의 서버 오류가 사라진다
    await user.type(screen.getByLabelText("코드"), "-2");
    expect(screen.queryByText(/이미 사용 중인 코드입니다/)).not.toBeInTheDocument();
  });

  it("서버가 필드 오류(422)를 주면 그 필드에 표시한다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer((req, std) =>
      req.method === "POST" && req.path === "/projects"
        ? errorBody(422, "VALIDATION_ERROR", "입력이 올바르지 않습니다.", [{ message: "서버: 시간대를 알 수 없습니다.", field_path: "/timezone" }])
        : std(req),
    );
    await open(server);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "프로젝트 만들기" }));
    expect((await screen.findAllByText(/서버: 시간대를 알 수 없습니다/, {}, slow)).length).toBeGreaterThan(0);
  });

  it("네트워크가 끊기면 처리 여부를 알 수 없다고 안내하고 목록 확인을 권한다", async () => {
    const user = userEvent.setup();
    const base = createFakeServer();
    const fetchImpl: typeof fetch = async (input, init) => {
      if ((init?.method ?? "GET") === "POST") throw new TypeError("network down");
      return base.fetchImpl(input, init);
    };
    renderApp("/projects/new", { source: "api", fetchImpl });
    await screen.findByLabelText("코드", {}, slow);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "프로젝트 만들기" }));
    expect(await screen.findByText(/요청이 처리되었는지 알 수 없습니다/, {}, slow)).toBeInTheDocument();
  });
});
