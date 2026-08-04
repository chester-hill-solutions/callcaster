import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
// test here. The stub still drives the real onPageDataChange contract, which is
// the only way the route learns the form is dirty.
vi.mock("@/components/campaign/settings/script/CampaignSettings.Script", () => ({
  default: ({
    pageData,
    onPageDataChange,
  }: {
    pageData: { campaignDetails: { script: { name: string } } };
    onPageDataChange: (next: unknown) => void;
  }) =>
    createElement(
      "button",
      {
        onClick: () =>
          onPageDataChange({
            campaignDetails: {
              script: {
                ...pageData.campaignDetails.script,
                name: `${pageData.campaignDetails.script.name} (edited)`,
              },
            },
          }),
      },
      "dirty the form",
    ),
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
  test("shows title and back link on a pristine script", async () => {
    await renderScriptEditor();

    // Regression: the SaveBar only mounts once the form is dirty, so a pristine
    // script previously had no title and no way back to the script list.
    expect(await screen.findByRole("heading", { name: "Voter ID script" })).toBeInTheDocument();
    expect(screen.getByLabelText("Back to scripts")).toBeInTheDocument();
    expect(screen.getByText("All changes saved")).toBeInTheDocument();

    // Saving belongs to the SaveBar alone, which is dirty-only — so a pristine
    // script has no save control at all. There is nothing to save.
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
  });

  // The header deliberately does NOT mirror a Save button: two controls whose
  // accessible names differ only by a suffix ("Save" vs "Save Changes") are
  // ambiguous to anyone resolving by name — a screen-reader user, or
  // e2e/specs/script-builder-smoke.spec.ts, which broke on exactly that.
  test("exposes exactly one save control once the form is dirty", async () => {
    await renderScriptEditor();
    await screen.findByRole("heading", { name: "Voter ID script" });

    await userEvent.click(screen.getByRole("button", { name: "dirty the form" }));

    expect(await screen.findByRole("button", { name: "Save Changes" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /save/i })).toHaveLength(1);
  });
});
