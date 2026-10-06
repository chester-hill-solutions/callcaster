import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";

const feedback = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", async (importOriginal) => ({
  ...(await importOriginal<typeof import("sonner")>()),
  toast: { error: feedback.error, success: feedback.success },
}));

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
// test here. The stub still drives the real onChange contract, which is the
// only way the route learns the form is dirty.
vi.mock("@/components/campaign/settings/script/CampaignSettings.Script", () => ({
  default: ({
    script,
    onChange,
  }: {
    script: { name: string };
    onChange: (next: unknown) => void;
  }) =>
    createElement(
      "button",
      {
        onClick: () => onChange({ ...script, name: `${script.name} (edited)` }),
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
  // accessible names differ only by a suffix ("Save" vs "Save changes") are
  // ambiguous to anyone resolving by name — a screen-reader user, or
  // e2e/specs/script-builder-smoke.spec.ts, which broke on exactly that.
  test("exposes exactly one save control once the form is dirty", async () => {
    await renderScriptEditor();
    await screen.findByRole("heading", { name: "Voter ID script" });

    await userEvent.click(screen.getByRole("button", { name: "dirty the form" }));

    expect(await screen.findByRole("button", { name: "Save changes" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /save/i })).toHaveLength(1);
  });
  test.each([
    [400, "The menu has invalid routing. Review Script validation."],
    [409, "The menu changed during this save. Review it and try again."],
  ])("keeps the failed draft and server feedback for a %s save, then permits retry", async (status, message) => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: message }), { status: Number(status) }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ script: { ...script, name: "Voter ID script (edited)" } }), { status: 200 }));
    vi.stubGlobal("fetch", request);
    feedback.error.mockClear(); feedback.success.mockClear();
    try {
      await renderScriptEditor();
      await screen.findByRole("heading", { name: script.name });
      await userEvent.click(screen.getByRole("button", { name: "dirty the form" }));
      await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
      await waitFor(() => expect(feedback.error).toHaveBeenCalledWith(message));
      expect(screen.getByRole("heading", { name: "Voter ID script (edited)" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
      expect(request).toHaveBeenCalledTimes(1);
      await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
      await waitFor(() => expect(feedback.success).toHaveBeenCalledWith("Script saved"));
      expect(request).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    } finally { vi.unstubAllGlobals(); }
  });

});
