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
  campaignType?: string | null;
  outreachDisposition?: string;
  outreachFetchError?: Error | null;
  outreachUpdateError?: Error | null;
  outreachUpdateThrows?: unknown;
  /** Override fields on the row returned by the outreach update (set a field
   * to undefined/null to simulate a sparse row for fallback-path tests). */
  outreachRowOverrides?: Record<string, unknown>;
  activeConferenceIds?: string[];
};

const defaultCallRow = {
  sid: "CA1",
  workspace: "w1",
  outreach_attempt_id: 10,
  conference_id: "u1~00000000-0000-0000-0000-000000000000",
  contact_id: 1,
  campaign_id: 1,
};

// The real updateOutreachAttemptForWorkspace returns the FULL updated row
// (drizzle `update` returning), not just the patch — callers read user_id and
// campaign_id off the result (e.g. auto-dial machine-answer → next dial turn).
const defaultOutreachRow = {
  id: 10,
  workspace: "w1",
  user_id: "u1",
  campaign_id: 1,
  contact_id: 1,
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
  findActiveConferenceIdsForUser: vi.fn(),
  updateCallBySid: vi.fn(),
  findOutreachAttemptById: vi.fn(),
  updateOutreachAttemptForWorkspace: vi.fn(),
  insertCallForWorkspace: vi.fn(),
  findCampaignTypeByCampaignId: vi.fn(),
  upsertCallBySid: vi.fn(),
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

  telephonyDbMocks.findActiveConferenceIdsForUser.mockImplementation(async () => {
    const cfg = readConfig();
    return cfg.activeConferenceIds ?? ["u1~00000000-0000-0000-0000-000000000000"];
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
      return {
        ...defaultOutreachRow,
        ...patch,
        contact_id: 1,
        ...(cfg.outreachRowOverrides ?? {}),
      };
    },
  );

  telephonyDbMocks.insertCallForWorkspace.mockImplementation(async () => ({
    ...defaultCallRow,
  }));

  telephonyDbMocks.findCampaignTypeByCampaignId.mockImplementation(async () => {
    const cfg = readConfig();
    return cfg.campaignType ?? null;
  });

  telephonyDbMocks.upsertCallBySid.mockImplementation(async (values: any) => {
    const cfg = readConfig();
    if (cfg.callRow === null) return null;
    const existing = await telephonyDbMocks.findCallBySid(values.sid);
    if (existing?.workspace) {
      return await telephonyDbMocks.updateCallBySid(
        existing.workspace,
        values.sid,
        values,
      );
    }
    return { ...defaultCallRow, ...(cfg.callRow ?? {}), ...values };
  });
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
