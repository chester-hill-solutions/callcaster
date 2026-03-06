import { beforeEach, describe, expect, test, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => {
  return {
    createClient: vi.fn(),
  };
});

vi.mock("@supabase/supabase-js", () => {
  return {
    createClient: (...args: any[]) => supabaseMocks.createClient(...args),
  };
});

vi.mock("@/lib/env.server", () => {
  return {
    env: new Proxy(
      {},
      {
        get: (_t, prop: string) => {
          if (prop === "SUPABASE_URL") return () => "https://sb.example";
          if (prop === "SUPABASE_SERVICE_KEY") return () => "svc";
          return () => "test";
        },
      },
    ),
  };
});

describe("app/routes/api.caller-id.status.tsx", () => {
  beforeEach(() => {
    supabaseMocks.createClient.mockReset();
    vi.resetModules();
  });

  test("returns parsed body when VerificationStatus is neither success nor failed", async () => {
    supabaseMocks.createClient.mockReturnValueOnce({ from: vi.fn() });
    const mod = await import("../app/routes/api.caller-id.status");
    const fd = new FormData();
    fd.set("VerificationStatus", "pending");
    fd.set("To", "+15555550100");
    const res = await mod.action({
      request: new Request("http://localhost/api/caller-id/status", { method: "POST", body: fd }),
    } as any);
    expect(await res.json()).toMatchObject({ VerificationStatus: "pending", To: "+15555550100" });
  });

  test("updates capabilities on success and returns first row", async () => {
    const update = vi.fn(() => ({
      eq: () => ({
        select: async () => ({ data: [{ id: 1 }], error: null }),
      }),
    }));
    supabaseMocks.createClient.mockReturnValueOnce({ from: () => ({ update }) });

    const mod = await import("../app/routes/api.caller-id.status");
    const fd = new FormData();
    fd.set("VerificationStatus", "success");
    fd.set("To", "+15555550100");
    const res = await mod.action({
      request: new Request("http://localhost/api/caller-id/status", { method: "POST", body: fd }),
    } as any);
    expect(await res.json()).toEqual({ id: 1 });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilities: expect.objectContaining({
          mms: true,
          sms: true,
          voice: true,
          verification_status: "success",
        }),
      }),
    );
  });

  test("updates capabilities on failed and handles DB error + empty update", async () => {
    let mode: "dbErr" | "empty" | "ok" = "dbErr";
    const update = vi.fn(() => ({
      eq: () => ({
        select: async () => {
          if (mode === "dbErr") return { data: null, error: new Error("db") };
          if (mode === "empty") return { data: [], error: null };
          return { data: [{ id: 1 }], error: null };
        },
      }),
    }));
    supabaseMocks.createClient.mockReturnValue({ from: () => ({ update }) });

    const mod = await import("../app/routes/api.caller-id.status");
    const makeReq = () => {
      const fd = new FormData();
      fd.set("VerificationStatus", "failed");
      fd.set("To", "+15555550100");
      return new Request("http://localhost/api/caller-id/status", { method: "POST", body: fd });
    };

    const r1 = await mod.action({ request: makeReq() } as any);
    expect(r1.status).toBe(500);

    mode = "empty";
    const r2 = await mod.action({ request: makeReq() } as any);
    expect(r2.status).toBe(500);

    mode = "ok";
    const r3 = await mod.action({ request: makeReq() } as any);
    expect(r3.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilities: expect.objectContaining({
          mms: false,
          sms: false,
          voice: false,
          verification_status: "failed",
        }),
      }),
    );
  });
});

