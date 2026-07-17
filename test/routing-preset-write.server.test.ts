import { beforeEach, describe, expect, test, vi } from "vitest";
import { applyRoutingPresetWithTenantDb } from "@/lib/routing-preset-write.server";

const queueFindFirst = vi.fn();
const scriptFindFirst = vi.fn();
const numberFindFirst = vi.fn();
const numberUpdate = vi.fn();

const tdb = {
  inbound_queue: { findFirst: queueFindFirst },
  script: { findFirst: scriptFindFirst },
  workspace_number: { findFirst: numberFindFirst, update: numberUpdate },
} as never;

describe("applyRoutingPresetWithTenantDb", () => {
  beforeEach(() => {
    queueFindFirst.mockReset();
    scriptFindFirst.mockReset();
    numberFindFirst.mockReset();
    numberUpdate.mockReset();
  });

  test("applies a complete queue patch after the scoped queue lookup succeeds", async () => {
    queueFindFirst.mockResolvedValue({ id: 7 });
    numberUpdate.mockResolvedValue([{ id: 2 }]);

    await expect(
      applyRoutingPresetWithTenantDb(tdb, "2", {
        presetId: "queue",
        queueId: 7,
      }),
    ).resolves.toEqual({ ok: true, number: { id: 2 } });

    expect(queueFindFirst).toHaveBeenCalledTimes(1);
    expect(numberUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: {
          handset_enabled: false,
          inbound_action: null,
          inbound_audio: null,
          inbound_queue_id: 7,
          inbound_script_id: null,
        },
      }),
    );
  });

  test("does not write when a queue is absent from the scoped workspace", async () => {
    queueFindFirst.mockResolvedValue(undefined);

    await expect(
      applyRoutingPresetWithTenantDb(tdb, "2", {
        presetId: "queue",
        queueId: 99,
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Choose a queue in this workspace",
      status: 400,
    });
    expect(numberUpdate).not.toHaveBeenCalled();
  });

  test("does not write when a script is absent from the scoped workspace", async () => {
    scriptFindFirst.mockResolvedValue(undefined);

    await expect(
      applyRoutingPresetWithTenantDb(tdb, "2", {
        presetId: "automated_menu",
        scriptId: 99,
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Choose an automated menu in this workspace",
      status: 400,
    });
    expect(numberUpdate).not.toHaveBeenCalled();
  });

  test("forwards only to a verified caller ID in the scoped workspace", async () => {
    numberFindFirst.mockResolvedValueOnce({
      id: 4,
      capabilities: { verification_status: "success" },
    });
    numberUpdate.mockResolvedValueOnce([{ id: 2 }]);

    await expect(
      applyRoutingPresetWithTenantDb(tdb, "2", {
        presetId: "forward",
        phoneNumber: "+14165550100",
      }),
    ).resolves.toEqual({ ok: true, number: { id: 2 } });

    numberFindFirst.mockResolvedValueOnce({
      id: 5,
      capabilities: { verification_status: "pending" },
    });

    await expect(
      applyRoutingPresetWithTenantDb(tdb, "2", {
        presetId: "forward",
        phoneNumber: "+14165550101",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Choose a verified caller ID in this workspace",
      status: 400,
    });
    expect(numberUpdate).toHaveBeenCalledTimes(1);
  });

  test("cannot persist a number outside the scoped workspace", async () => {
    numberUpdate.mockResolvedValue([]);

    await expect(
      applyRoutingPresetWithTenantDb(tdb, "88", {
        presetId: "webhook_only",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Phone number not found",
      status: 404,
    });
    expect(numberUpdate).toHaveBeenCalledTimes(1);
  });

  test("validation failures write nothing", async () => {
    await expect(
      applyRoutingPresetWithTenantDb(tdb, "2", {
        presetId: "voicemail",
        notificationEmail: "invalid",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "A valid voicemail notification email is required",
      status: 400,
    });
    expect(numberUpdate).not.toHaveBeenCalled();
  });
});
