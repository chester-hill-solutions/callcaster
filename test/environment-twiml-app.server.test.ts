import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensureEnvironmentTwimlApp,
  isManagedEnvironment,
  environmentTwimlAppName,
} from "@/server/environment-twiml-app.server";

const twilioMocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock("twilio", () => ({
  default: () => ({
    applications: Object.assign(
      (sid: string) => ({
        update: (...args: unknown[]) => twilioMocks.update(sid, ...args),
      }),
      {
        list: (...args: unknown[]) => twilioMocks.list(...args),
        create: (...args: unknown[]) => twilioMocks.create(...args),
      },
    ),
  }),
}));

function managedEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    RAILWAY_ENVIRONMENT_NAME: "callcaster-pr-1047",
    TWILIO_SID: "ACtest",
    TWILIO_AUTH_TOKEN: "token",
    BASE_URL: "https://callcaster-callcaster-pr-1047.up.railway.app",
    TWILIO_APP_SID: "APinheritedFromProduction",
    ...overrides,
  };
}

describe("environmentTwimlAppName", () => {
  it("namespaces the app by environment so environments are prunable", () => {
    expect(environmentTwimlAppName("callcaster-pr-1047")).toBe("env:callcaster-pr-1047");
  });
});

describe("isManagedEnvironment", () => {
  it.each([
    [{ RAILWAY_ENVIRONMENT_NAME: "callcaster-pr-1047" }, true],
    [{ RAILWAY_ENVIRONMENT_NAME: "staging" }, true],
    [{ RAILWAY_ENVIRONMENT_NAME: "production" }, false],
    [{}, false],
  ])("%o -> %s", (env, expected) => {
    expect(isManagedEnvironment(env as NodeJS.ProcessEnv)).toBe(expected);
  });
});

describe("ensureEnvironmentTwimlApp", () => {
  beforeEach(() => {
    twilioMocks.list.mockReset();
    twilioMocks.create.mockReset();
    twilioMocks.update.mockReset();
  });

  it("leaves production's explicit app SID alone", async () => {
    const env = managedEnv({ RAILWAY_ENVIRONMENT_NAME: "production" });

    const result = await ensureEnvironmentTwimlApp(env);

    expect(result.status).toBe("skipped");
    expect(env.TWILIO_APP_SID).toBe("APinheritedFromProduction");
    expect(twilioMocks.create).not.toHaveBeenCalled();
    expect(twilioMocks.update).not.toHaveBeenCalled();
  });

  it("skips outside Railway", async () => {
    const env = managedEnv({ RAILWAY_ENVIRONMENT_NAME: undefined });

    const result = await ensureEnvironmentTwimlApp(env);

    expect(result.status).toBe("skipped");
    expect(twilioMocks.create).not.toHaveBeenCalled();
  });

  it("creates an app for a managed environment and overrides the inherited SID", async () => {
    twilioMocks.list.mockResolvedValueOnce([]);
    twilioMocks.create.mockResolvedValueOnce({ sid: "APnew" });
    const env = managedEnv();

    const result = await ensureEnvironmentTwimlApp(env);

    expect(twilioMocks.create).toHaveBeenCalledWith({
      friendlyName: "env:callcaster-pr-1047",
      voiceUrl: "https://callcaster-callcaster-pr-1047.up.railway.app/api/call",
      voiceMethod: "POST",
    });
    expect(env.TWILIO_APP_SID).toBe("APnew");
    expect(result).toMatchObject({ status: "provisioned", sid: "APnew", created: true });
  });

  it("reuses the existing app across redeploys instead of creating duplicates", async () => {
    twilioMocks.list.mockResolvedValueOnce([{ sid: "APexisting" }]);
    twilioMocks.update.mockResolvedValueOnce({ sid: "APexisting" });
    const env = managedEnv();

    const result = await ensureEnvironmentTwimlApp(env);

    expect(twilioMocks.create).not.toHaveBeenCalled();
    expect(twilioMocks.update).toHaveBeenCalledWith("APexisting", {
      voiceUrl: "https://callcaster-callcaster-pr-1047.up.railway.app/api/call",
      voiceMethod: "POST",
    });
    expect(env.TWILIO_APP_SID).toBe("APexisting");
    expect(result).toMatchObject({ status: "provisioned", created: false });
  });

  it("repoints an existing app when the environment URL changes", async () => {
    twilioMocks.list.mockResolvedValueOnce([{ sid: "APexisting" }]);
    twilioMocks.update.mockResolvedValueOnce({ sid: "APexisting" });

    await ensureEnvironmentTwimlApp(managedEnv({ BASE_URL: "https://moved.up.railway.app" }));

    expect(twilioMocks.update).toHaveBeenCalledWith("APexisting", {
      voiceUrl: "https://moved.up.railway.app/api/call",
      voiceMethod: "POST",
    });
  });

  it("strips a trailing slash from BASE_URL so the voice URL is not double-slashed", async () => {
    twilioMocks.list.mockResolvedValueOnce([]);
    twilioMocks.create.mockResolvedValueOnce({ sid: "APnew" });

    await ensureEnvironmentTwimlApp(managedEnv({ BASE_URL: "https://preview.up.railway.app/" }));

    expect(twilioMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ voiceUrl: "https://preview.up.railway.app/api/call" }),
    );
  });

  it("refuses to boot on Twilio failure rather than falling back to production's app", async () => {
    twilioMocks.list.mockRejectedValueOnce(new Error("Twilio is down"));
    const env = managedEnv();

    await expect(ensureEnvironmentTwimlApp(env)).rejects.toThrow(/route this environment's calls through production/);
    expect(env.TWILIO_APP_SID).toBe("APinheritedFromProduction");
  });
});
