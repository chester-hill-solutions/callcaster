import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";

// The route re-exports its loader/action from server-only modules; the
// component under test never runs them, so stub them out to keep the DB out of
// jsdom.
vi.mock("../../app/routes/workspaces+/$id/scripts/$scriptId.loader.server", () => ({
  loader: vi.fn(),
}));
vi.mock("../../app/routes/workspaces+/$id/scripts/$scriptId.action.server", () => ({
  action: vi.fn(),
}));

// The script editor body is a large tree of its own; the header is what's under
// test here.
vi.mock("@/components/campaign/settings/script/CampaignSettings.Script", () => ({
  default: () => createElement("div", null, "script-body"),
}));

const script = {
  id: 7,
  name: "Voter ID script",
  steps: { pages: {}, blocks: {} },
  type: "script",
  workspace: "ws-1",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: null,
  created_by: null,
  updated_by: null,
};

async function renderScriptEditor() {
  const mod = await import("../../app/routes/workspaces+/$id/scripts/$scriptId.route");
  const router = createMemoryRouter(
    [
      {
        path: "/workspaces/:id/scripts/:scriptId",
        Component: mod.default,
        loader: () => ({ script, mediaNames: [] }),
      },
    ],
    { initialEntries: ["/workspaces/ws-1/scripts/7"] },
  );
  return render(createElement(RouterProvider, { router }));
}

describe("app/routes/workspaces+/$id/scripts/$scriptId.route.tsx", () => {
  test("shows title, back link, and save control on a pristine script", async () => {
    await renderScriptEditor();

    // Regression: the SaveBar only mounts once the form is dirty, so a pristine
    // script previously had no title, no way back, and no save affordance.
    expect(await screen.findByRole("heading", { name: "Voter ID script" })).toBeInTheDocument();
    expect(screen.getByLabelText("Back to scripts")).toBeInTheDocument();

    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeInTheDocument();
    expect(save).toBeDisabled();

    expect(screen.getByText("All changes saved")).toBeInTheDocument();
    // The dirty-only SaveBar is still absent.
    expect(screen.queryByRole("button", { name: "Save Changes" })).not.toBeInTheDocument();
  });
});
