import { vi } from "vitest";
import { canTransitionOutreachDisposition } from "@/lib/outreach-disposition";

export type TelephonyStubConfig = {
  callRow?: Record<string, unknown> | null;
  callSelectError?: Error | null;
  callUpdateError?: Error | null;
  callsByConference?: Array<{
    sid: string;
    outreach_attempt_id?: number | null;
    contact_id?: number | null;
  }>;
  outreachDisposition?: string;
  outreachFetchError?: Error | null;
  outreachUpdateError?: Error | null;
  outreachUpdateThrows?: unknown;
};

const defaultCallRow = {
  sid: "CA1",
  workspace: "w1",
  outreach_attempt_id: 10,
  conference_id: "conf1",
  contact_id: 1,
  campaign_id: 1,
};

export const telephonyStubState = {
  config: {} as TelephonyStubConfig,
  outreachUpdateCalls: [] as unknown[],
  callUpdateCalls: [] as Array<{ workspaceId: string; sid: string; patch: unknown }>,
};

function readConfig(): TelephonyStubConfig {
  return telephonyStubState.config;
}

export const telephonyDbMocks = {
  findCallBySid: vi.fn(),
  findCallsByConferenceId: vi.fn(),
  updateCallBySid: vi.fn(),
  findOutreachAttemptById: vi.fn(),
  updateOutreachAttemptForWorkspace: vi.fn(),
  insertCallForWorkspace: vi.fn(),
};

function applyTelephonyMockImplementations() {
  telephonyDbMocks.findCallBySid.mockImplementation(async (sid: string) => {
    const cfg = readConfig();
    if (cfg.callSelectError) throw cfg.callSelectError;
    if (cfg.callRow === null) return null;
    return { ...defaultCallRow, ...(cfg.callRow ?? {}), sid };
  });

  telephonyDbMocks.findCallsByConferenceId.mockImplementation(async () => {
    const cfg = readConfig();
    return cfg.callsByConference ?? [];
  });

  telephonyDbMocks.updateCallBySid.mockImplementation(
    async (workspaceId: string, sid: string, patch: Record<string, unknown>) => {
      const cfg = readConfig();
      telephonyStubState.callUpdateCalls.push({ workspaceId, sid, patch });
      if (cfg.callUpdateError) throw cfg.callUpdateError;
      return { ...defaultCallRow, ...(cfg.callRow ?? {}), sid, ...patch };
    },
  );

  telephonyDbMocks.findOutreachAttemptById.mockImplementation(async () => {
    const cfg = readConfig();
    if (cfg.outreachFetchError) return null;
    return {
      disposition: cfg.outreachDisposition ?? "in-progress",
      contact_id: 1,
    };
  });

  telephonyDbMocks.updateOutreachAttemptForWorkspace.mockImplementation(
    async (_workspaceId: string, _id: number | string, patch: Record<string, unknown>) => {
      const cfg = readConfig();
      if (patch.disposition && cfg.outreachDisposition) {
        if (
          !canTransitionOutreachDisposition(
            String(cfg.outreachDisposition),
            String(patch.disposition),
          )
        ) {
          return { disposition: cfg.outreachDisposition, contact_id: 1 };
        }
      }
      if (cfg.outreachUpdateThrows != null) {
        return new Response(
          `Error updating outreach attempt: ${cfg.outreachUpdateThrows instanceof Error ? cfg.outreachUpdateThrows.message : "Unknown error"}`,
          { status: 500 },
        );
      }
      if (cfg.outreachUpdateError) {
        return new Response(
          `Error updating outreach attempt: ${cfg.outreachUpdateError.message}`,
          { status: 500 },
        );
      }
      telephonyStubState.outreachUpdateCalls.push(patch);
      return { ...patch, contact_id: 1 };
    },
  );

  telephonyDbMocks.insertCallForWorkspace.mockImplementation(async () => ({
    ...defaultCallRow,
  }));
}

applyTelephonyMockImplementations();

export function configureTelephonyStub(config: TelephonyStubConfig = {}) {
  telephonyStubState.config = config;
  telephonyStubState.outreachUpdateCalls = [];
  telephonyStubState.callUpdateCalls = [];
  applyTelephonyMockImplementations();
}

export function resetTelephonyStubMocks() {
  configureTelephonyStub({});
}
