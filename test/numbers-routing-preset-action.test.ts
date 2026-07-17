import { beforeEach, describe, expect, test, vi } from "vitest";
import { parseRoutingPresetApplication } from "@/lib/routing-preset-form";
import { normalizeRouteResult } from "./helpers/route-result";
import { withWorkspaceRouteArgs } from "./helpers/route-context-mock";

const mocks = vi.hoisted(() => ({
  applyWorkspaceNumberRoutingPreset: vi.fn(),
  requireWorkspaceAccess: vi.fn(async () => undefined),
}));

vi.mock("@/lib/platform-workspace-numbers.server", () => ({
  applyWorkspaceNumberRoutingPreset:
    mocks.applyWorkspaceNumberRoutingPreset,
  deleteWorkspaceNumber: vi.fn(),
  patchWorkspaceNumber: vi.fn(),
  verifyWorkspaceCallerId: vi.fn(),
}));

vi.mock("@/lib/database/workspace.server", () => ({
  requireWorkspaceAccess: mocks.requireWorkspaceAccess,
}));

function form(values: Record<string, string>): Record<string, FormDataEntryValue> {
  return values;
}

describe("numbers routing preset action parsing", () => {
  test("parses preset-specific fields", () => {
    expect(
      parseRoutingPresetApplication(
        form({ presetId: "agent", fallbackEmail: "agent@example.com", audioName: "Busy" }),
      ),
    ).toEqual({
      presetId: "agent",
      fallbackEmail: "agent@example.com",
      audioName: "Busy",
    });
    expect(
      parseRoutingPresetApplication(form({ presetId: "queue", queueId: "12" })),
    ).toEqual({ presetId: "queue", queueId: 12 });
    expect(
      parseRoutingPresetApplication(
        form({ presetId: "automated_menu", scriptId: "8" }),
      ),
    ).toEqual({ presetId: "automated_menu", scriptId: 8 });
    expect(
      parseRoutingPresetApplication(
        form({
          presetId: "voicemail",
          notificationEmail: "voice@example.com",
          audioName: "Greeting",
        }),
      ),
    ).toEqual({
      presetId: "voicemail",
      notificationEmail: "voice@example.com",
      audioName: "Greeting",
    });
    expect(
      parseRoutingPresetApplication(
        form({ presetId: "forward", phoneNumber: "+1 416 555 0100" }),
      ),
    ).toEqual({ presetId: "forward", phoneNumber: "+1 416 555 0100" });
    expect(
      parseRoutingPresetApplication(form({ presetId: "webhook_only" })),
    ).toEqual({ presetId: "webhook_only" });
  });

  test("rejects custom, unknown, and partial ID presets before writing", () => {
    expect(() =>
      parseRoutingPresetApplication(form({ presetId: "custom" })),
    ).toThrow("Choose a routing preset");
    expect(() =>
      parseRoutingPresetApplication(form({ presetId: "unknown" })),
    ).toThrow("Choose a routing preset");
    expect(() =>
      parseRoutingPresetApplication(form({ presetId: "queue", queueId: "" })),
    ).toThrow("Choose a queue");
    expect(() =>
      parseRoutingPresetApplication(
        form({ presetId: "automated_menu", scriptId: "0" }),
      ),
    ).toThrow("Choose an automated menu");
  });
});

describe("numbers routing preset action", () => {
  beforeEach(() => {
    mocks.applyWorkspaceNumberRoutingPreset.mockReset();
    mocks.requireWorkspaceAccess.mockClear();
  });

  test("returns 400 when a scoped queue reference is missing", async () => {
    mocks.applyWorkspaceNumberRoutingPreset.mockResolvedValue({
      ok: false,
      error: "Choose a queue in this workspace",
      status: 400,
    });
    const body = new FormData();
    body.set("formName", "apply-routing-preset");
    body.set("numberId", "2");
    body.set("presetId", "queue");
    body.set("queueId", "99");
    const { action } = await import(
      "../app/routes/workspaces+/$id/settings/numbers.action.server"
    );

    const result = await normalizeRouteResult(
      await action(
        await withWorkspaceRouteArgs(
          {
            request: new Request(
              "http://localhost/workspaces/w1/settings/numbers",
              { method: "POST", body },
            ),
            params: { id: "w1" },
          },
          { userId: "u1", workspaceId: "w1", userRole: "admin" },
        ),
      ),
    );

    expect(result).toMatchObject({
      status: 400,
      body: { error: "Choose a queue in this workspace" },
    });
    expect(mocks.applyWorkspaceNumberRoutingPreset).toHaveBeenCalledWith(
      "u1",
      "w1",
      "2",
      { presetId: "queue", queueId: 99 },
    );
  });
});
