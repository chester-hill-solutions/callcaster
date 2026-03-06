import { beforeEach, describe, expect, test, vi } from "vitest";

const twilioMocks = vi.hoisted(() => {
  return {
    validationCreate: vi.fn(),
  };
});

vi.mock("twilio", () => {
  class TwilioClient {
    validationRequests = { create: (...args: any[]) => twilioMocks.validationCreate(...args) };
  }
  return {
    default: {
      Twilio: TwilioClient,
    },
  };
});

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
          if (prop === "BASE_URL") return () => "https://base.example";
          return () => "test";
        },
      },
    ),
  };
});

describe("app/routes/api.caller-id.tsx", () => {
  beforeEach(() => {
    twilioMocks.validationCreate.mockReset();
    twilioMocks.validationCreate.mockResolvedValue({ sid: "VR0" });
    supabaseMocks.createClient.mockReset();
    vi.resetModules();
  });

  function setSupabaseWorkspaceSingle(result: { data: any; error: any }) {
    const workspaceSingle = vi.fn(async () => result);
    const workspaceChain: any = { select: () => workspaceChain, eq: () => workspaceChain, single: workspaceSingle };
    return { workspaceChain, workspaceSingle };
  }

  function setSupabaseUpsertSelect(result: { data: any; error: any }) {
    const upsertSelect = vi.fn(async () => result);
    const upsertChain: any = { upsert: () => ({ select: upsertSelect }) };
    return { upsertChain, upsertSelect };
  }

  test("returns 500 on workspace query error / missing data / missing twilio_data", async () => {
    const mod = await import("../app/routes/api.caller-id");
    const makeReq = (body: any) =>
      new Request("http://localhost/api/caller-id", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });

    // workspace query error
    {
      const { workspaceChain } = setSupabaseWorkspaceSingle({ data: null, error: new Error("q") });
      supabaseMocks.createClient.mockReturnValueOnce({
        from: (t: string) => {
          if (t === "workspace") return workspaceChain;
          throw new Error("unexpected");
        },
      });
      const res = await mod.action({ request: makeReq({ phoneNumber: "5555550100", workspace_id: "w1", friendlyName: "n" }) } as any);
      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toMatchObject({ error: "Supabase query error: q" });
    }

    // no workspace data
    {
      const { workspaceChain } = setSupabaseWorkspaceSingle({ data: null, error: null });
      supabaseMocks.createClient.mockReturnValueOnce({
        from: (t: string) => {
          if (t === "workspace") return workspaceChain;
          throw new Error("unexpected");
        },
      });
      const res = await mod.action({ request: makeReq({ phoneNumber: "5555550100", workspace_id: "w1", friendlyName: "n" }) } as any);
      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toMatchObject({ error: "No workspace data found" });
    }

    // missing twilio_data
    {
      const { workspaceChain } = setSupabaseWorkspaceSingle({ data: { key: "k", token: "t" }, error: null });
      supabaseMocks.createClient.mockReturnValueOnce({
        from: (t: string) => {
          if (t === "workspace") return workspaceChain;
          throw new Error("unexpected");
        },
      });
      const res = await mod.action({ request: makeReq({ phoneNumber: "5555550100", workspace_id: "w1", friendlyName: "n" }) } as any);
      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toMatchObject({ error: "Workspace twilio_data not found" });
    }
  }, 20000);

  test("returns 500 on invalid phone number length", async () => {
    const mod = await import("../app/routes/api.caller-id");
    const { workspaceChain } = setSupabaseWorkspaceSingle({
      data: { twilio_data: { sid: "AC", authToken: "at" } },
      error: null,
    });
    supabaseMocks.createClient.mockReturnValueOnce({
      from: (t: string) => {
        if (t === "workspace") return workspaceChain;
        throw new Error("unexpected");
      },
    });
    const res = await mod.action({
      request: new Request("http://localhost/api/caller-id", {
        method: "POST",
        body: JSON.stringify({ phoneNumber: "+123", workspace_id: "w1", friendlyName: "n" }),
        headers: { "Content-Type": "application/json" },
      }),
    } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid phone number length" });
  });

  test("continues when Twilio validation request rejects (it is caught + logged)", async () => {
    const mod = await import("../app/routes/api.caller-id");
    const { workspaceChain } = setSupabaseWorkspaceSingle({
      data: { twilio_data: { sid: "AC", authToken: "at" } },
      error: null,
    });
    const { upsertChain } = setSupabaseUpsertSelect({ data: [{ id: 1 }], error: null });

    twilioMocks.validationCreate.mockRejectedValueOnce(new Error("twilio down"));

    supabaseMocks.createClient.mockReturnValueOnce({
      from: (t: string) => {
        if (t === "workspace") return workspaceChain;
        if (t === "workspace_number") return upsertChain;
        throw new Error("unexpected");
      },
    });

    const res = await mod.action({
      request: new Request("http://localhost/api/caller-id", {
        method: "POST",
        body: JSON.stringify({ phoneNumber: "5555550100", workspace_id: "w1", friendlyName: "n" }),
        headers: { "Content-Type": "application/json" },
      }),
    } as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ numberRequest: [{ id: 1 }] });
    expect(body.validationRequest).toBeUndefined();
  });

  test("returns 500 on workspace_number upsert error", async () => {
    const mod = await import("../app/routes/api.caller-id");
    const { workspaceChain } = setSupabaseWorkspaceSingle({
      data: { twilio_data: { sid: "AC", authToken: "at" } },
      error: null,
    });
    const { upsertChain } = setSupabaseUpsertSelect({ data: null, error: new Error("ins") });

    supabaseMocks.createClient.mockReturnValueOnce({
      from: (t: string) => {
        if (t === "workspace") return workspaceChain;
        if (t === "workspace_number") return upsertChain;
        throw new Error("unexpected");
      },
    });

    const res = await mod.action({
      request: new Request("http://localhost/api/caller-id", {
        method: "POST",
        body: JSON.stringify({ phoneNumber: "5555550100", workspace_id: "w1", friendlyName: "n" }),
        headers: { "Content-Type": "application/json" },
      }),
    } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "Error inserting workspace number: ins" });
  });

  test("happy path returns validationRequest + numberRequest (covers + in middle normalization)", async () => {
    const mod = await import("../app/routes/api.caller-id");
    const { workspaceChain } = setSupabaseWorkspaceSingle({
      data: { twilio_data: { sid: "AC", authToken: "at" } },
      error: null,
    });
    const { upsertChain, upsertSelect } = setSupabaseUpsertSelect({ data: [{ id: 1 }], error: null });

    twilioMocks.validationCreate.mockResolvedValueOnce({ sid: "VR1" });

    supabaseMocks.createClient.mockReturnValueOnce({
      from: (t: string) => {
        if (t === "workspace") return workspaceChain;
        if (t === "workspace_number") return upsertChain;
        throw new Error("unexpected");
      },
    });

    const res = await mod.action({
      request: new Request("http://localhost/api/caller-id", {
        method: "POST",
        body: JSON.stringify({ phoneNumber: "1+5555550100", workspace_id: "w1", friendlyName: "n" }),
        headers: { "Content-Type": "application/json" },
      }),
    } as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.validationRequest).toMatchObject({ sid: "VR1" });
    expect(body.numberRequest).toEqual([{ id: 1 }]);
    expect(upsertSelect).toHaveBeenCalled();
  });
});

