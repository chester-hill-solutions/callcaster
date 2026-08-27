import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { Toaster } from "sonner";

// The route re-exports its loader/action from server-only modules; the
// component under test never runs them, so stub them out to keep the DB out of
// jsdom.
vi.mock(
  "../../app/routes/workspaces+/$id/campaigns/$selected_id/script/edit.loader.server",
  () => ({ loader: vi.fn() }),
);
vi.mock(
  "../../app/routes/workspaces+/$id/campaigns/$selected_id/script/edit.action.server",
  () => ({ action: vi.fn() }),
);

// Stub the script editor body: expose whether it is read-only and offer a
// button that dirties the script CONTENT through the real onPageDataChange
// contract (#1124's distinction between attaching and editing). Also expose
// whether an upload handler is wired through, so #1346's regression is visible.
vi.mock("@/components/campaign/settings/script/CampaignSettings.Script", () => ({
  default: ({
    script,
    onChange,
    readOnly,
    onUploadAudio,
  }: {
    script: { name: string; steps: unknown };
    onChange: (next: unknown) => void;
    readOnly?: boolean;
    onUploadAudio?: (file: File) => Promise<string | null>;
  }) =>
    createElement(
      "div",
      {
        "data-testid": "script-editor",
        "data-readonly": String(readOnly ?? false),
        "data-has-upload": String(typeof onUploadAudio === "function"),
      },
      createElement(
        "button",
        {
          onClick: () =>
            onChange({
              ...script,
              steps: { pages: { edited: true }, blocks: {} },
            }),
        },
        "dirty the script content",
      ),
      createElement(
        "button",
        {
          onClick: () => onUploadAudio?.(new File(["x"], "message.mp3")),
        },
        "upload audio",
      ),
    ),
}));

// Radix Select is hostile to jsdom interaction; the dropdown's contract is
// handleInputChange("script_id", value), so drive that directly.
vi.mock(
  "@/components/campaign/settings/detailed/CampaignDetailed.SelectScript",
  () => ({
    default: ({
      handleInputChange,
      selectedScript,
    }: {
      handleInputChange: (name: string, value: string | number | null) => void;
      selectedScript: number | string | null;
    }) =>
      createElement(
        "div",
        null,
        createElement("span", { "data-testid": "selected-script" }, String(selectedScript)),
        createElement(
          "button",
          { onClick: () => handleInputChange("script_id", 9) },
          "attach script nine",
        ),
      ),
  }),
);

function makeScript(id: number, name: string) {
  return {
    id,
    name,
    steps: { pages: {}, blocks: {} },
    type: "script",
    workspace: "ws-1",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: null,
    created_by: null,
    updated_by: null,
  };
}

const sampleScript = makeScript(7, "Sample script — customer check-in");
const otherScript = makeScript(9, "Second script");

function makeLoaderData(overrides: Record<string, unknown> = {}) {
  return {
    workspace_id: "ws-1",
    selected_id: "1",
    data: {
      id: 1,
      workspace: "ws-1",
      type: "live_call",
      campaignDetails: {
        campaign_id: 1,
        created_at: "2026-01-01T00:00:00.000Z",
        id: 11,
        script_id: 7,
        workspace: "ws-1",
        script: sampleScript,
      },
    },
    mediaNames: [],
    userRole: "admin",
    scripts: [sampleScript, otherScript],
    ...overrides,
  };
}

async function renderRoute(loaderData = makeLoaderData()) {
  const mod = await import(
    "../../app/routes/workspaces+/$id/campaigns/$selected_id/script/edit.route"
  );
  const router = createMemoryRouter(
    [
      {
        path: "/workspaces/:id/campaigns/:selected_id/script/edit",
        Component: mod.default,
        loader: () => loaderData,
      },
    ],
    { initialEntries: ["/workspaces/ws-1/campaigns/1/script/edit"] },
  );
  return render(
    createElement(
      "div",
      null,
      createElement(RouterProvider, { router }),
      createElement(Toaster),
    ),
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/api/audio-upload")) {
        return { ok: true, json: async () => ({ name: "message.mp3" }) };
      }
      return { ok: true, json: async () => ({ script: otherScript }) };
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("campaign script edit route (#1124)", () => {
  test("script preview starts read-only with an explicit edit affordance", async () => {
    await renderRoute();

    const editor = await screen.findByTestId("script-editor");
    expect(editor).toHaveAttribute("data-readonly", "true");
    expect(screen.getByRole("button", { name: "Edit script" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Edit script" }));
    expect(screen.getByTestId("script-editor")).toHaveAttribute("data-readonly", "false");
  });

  test("selection-only change saves directly — no save-as-copy modal", async () => {
    await renderRoute();

    await userEvent.click(await screen.findByRole("button", { name: "attach script nine" }));
    await userEvent.click(await screen.findByRole("button", { name: /save changes/i }));

    // No dialog asked about copying; the PATCH went straight out.
    expect(
      screen.queryByText(/save as a copy/i),
    ).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]?.body as FormData;
    expect(body.get("saveScriptAsCopy")).toBe("false");
    expect(
      JSON.parse(String(body.get("campaignDetails"))).script_id,
    ).toBe(9);
  });

  test("content edit still routes through the save-as-copy dialog", async () => {
    await renderRoute();

    await userEvent.click(await screen.findByRole("button", { name: "Edit script" }));
    await userEvent.click(screen.getByRole("button", { name: "dirty the script content" }));
    await userEvent.click(await screen.findByRole("button", { name: /save changes/i }));

    expect(await screen.findByText(/save as a copy/i)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Save as Copy" }));
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]?.body as FormData;
    expect(body.get("saveScriptAsCopy")).toBe("true");
  });

  test("switching scripts leaves edit mode", async () => {
    await renderRoute();

    await userEvent.click(await screen.findByRole("button", { name: "Edit script" }));
    expect(screen.getByTestId("script-editor")).toHaveAttribute("data-readonly", "false");

    await userEvent.click(screen.getByRole("button", { name: "attach script nine" }));
    expect(screen.getByTestId("script-editor")).toHaveAttribute("data-readonly", "true");
  });

  test("audio upload is wired to the campaign script editor (#1346)", async () => {
    await renderRoute();

    // The editor always receives the handler — even in read-only preview — so
    // recorded IVR blocks can show their upload affordance once editing.
    const editor = await screen.findByTestId("script-editor");
    expect(editor).toHaveAttribute("data-has-upload", "true");

    await userEvent.click(screen.getByRole("button", { name: "upload audio" }));

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/audio-upload");
    const body = (init as RequestInit).body as FormData;
    expect(body.get("workspaceId")).toBe("ws-1");
    expect(body.get("media")).toBeInstanceOf(File);
  });

  test("audio upload failure surfaces a toast and returns null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Upload rejected." }) }),
    );
    await renderRoute();

    await userEvent.click(await screen.findByRole("button", { name: "upload audio" }));

    expect(await screen.findByText("Upload rejected.")).toBeInTheDocument();
  });
});
