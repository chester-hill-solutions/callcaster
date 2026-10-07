import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { Twilio } from "twilio";
import RequestClient from "twilio/lib/base/RequestClient";
import { RouterContextProvider } from "react-router";
import { asRouteResponse } from "../helpers/route-result";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { onboardingFixture } from "../fixtures/onboarding";

const signature = vi.hoisted(() => vi.fn());
let callbackSdk: Twilio;
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  createWorkspaceTwilioInstance: async () => callbackSdk,
}));
vi.mock("@/lib/twilio-webhook.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/twilio-webhook.server")>()),
  requireTwilioSignature: (...args: unknown[]) => signature(...args),
}));

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const workspaceId = randomUUID();
const foreignId = randomUUID();

suite("stored A2P business and preparation state (#2282)", () => {
  let client: postgres.Sql;
  let pools:
    Pick<typeof import("@/server/db"), "pool" | "directPool"> | undefined;
  let onboarding: typeof import("@/lib/messaging-onboarding/persistence.server");
  let actions: typeof import("@/lib/onboarding-actions.server");
  let invalidate: typeof import("@/lib/merge-workspace-twilio-data.server").invalidateWorkspaceTwilioData;
  beforeAll(async () => {
    if (!databaseUrl) throw new Error("A2P profile tests need a database");
    vi.stubEnv("DATABASE_URL", databaseUrl);
    vi.stubEnv("DATABASE_DIRECT_URL", databaseUrl);
    client = postgres(databaseUrl, { max: 1 });
    for (const id of [workspaceId, foreignId]) {
      await client`insert into workspace (id, name, twilio_data) values (${id}::uuid, 'A2P profile fixture', '{}'::jsonb)`;
    }
    pools = await import("@/server/db");
    onboarding = await import("@/lib/messaging-onboarding/persistence.server");
    actions = await import("@/lib/onboarding-actions.server");
    ({ invalidateWorkspaceTwilioData: invalidate } =
      await import("@/lib/merge-workspace-twilio-data.server"));
  });
  beforeEach(async () => {
    signature.mockReset();
    signature.mockResolvedValue(null);
    const state = onboardingFixture();
    await client`update workspace set twilio_data = ${client.json({ marker: "keep", onboarding: state })} where id = ${workspaceId}::uuid`;
    await client`update workspace set twilio_data = ${client.json({ marker: "foreign", onboarding: { ...state, businessProfile: { ...state.businessProfile, a2pCompanyType: "government" } } })} where id = ${foreignId}::uuid`;
    invalidate(workspaceId);
    invalidate(foreignId);
  });
  afterAll(async () => {
    try {
      if (client)
        await client`delete from workspace where id in (${workspaceId}::uuid, ${foreignId}::uuid)`;
    } finally {
      try {
        await Promise.all([
          client?.end(),
          pools?.pool.end(),
          pools?.directPool.end(),
        ]);
      } finally {
        vi.unstubAllEnvs();
      }
    }
  });
  test("both runtime pools use the selected fixture database", async () => {
    if (!pools) throw new Error("Runtime database pools were not loaded");
    const [primary] =
      await pools.pool`select twilio_data from workspace where id = ${workspaceId}::uuid`;
    const [direct] =
      await pools.directPool`select twilio_data from workspace where id = ${foreignId}::uuid`;
    expect(primary.twilio_data.marker).toBe("keep");
    expect(direct.twilio_data.marker).toBe("foreign");
  });
  test.each(["government", "non-profit", "private", "public"] as const)(
    "%s survives actual storage and unrelated saves",
    async (company) => {
      const current = await onboarding.getWorkspaceMessagingOnboardingState({
        workspaceId,
      });
      const form = new FormData();
      form.set("a2pCompanyType", company);
      form.set("a2pStockExchange", "NASDAQ");
      form.set("a2pStockTicker", "ACME");
      form.set("a2pBrandContactEmail", "jordan@acme.example");
      await onboarding.updateWorkspaceMessagingOnboardingState({
        workspaceId,
        actorUserId: null,
        updates: {
          businessProfile: actions.buildBusinessProfile(
            form,
            current.businessProfile,
          ),
        },
      });
      const loaded = await onboarding.getWorkspaceMessagingOnboardingState({
        workspaceId,
      });
      const partial = new FormData();
      partial.set("useCaseSummary", "Appointment reminders");
      await onboarding.updateWorkspaceMessagingOnboardingState({
        workspaceId,
        actorUserId: null,
        updates: {
          businessProfile: actions.buildBusinessProfile(
            partial,
            loaded.businessProfile,
          ),
        },
      });
      const [row] =
        await client`select twilio_data from workspace where id = ${workspaceId}::uuid`;
      expect(row.twilio_data).toMatchObject({
        marker: "keep",
        onboarding: {
          businessProfile: {
            a2pCompanyType: company,
            a2pStockExchange: "NASDAQ",
            a2pStockTicker: "ACME",
            a2pBrandContactEmail: "jordan@acme.example",
            useCaseSummary: "Appointment reminders",
          },
        },
      });
      expect(
        (
          await onboarding.getWorkspaceMessagingOnboardingState({
            workspaceId: foreignId,
          })
        ).businessProfile.a2pCompanyType,
      ).toBe("government");
    },
  );
  test("unproven old approval stays blocked through the actual stored readiness predicate", async () => {
    const state = onboardingFixture({
      operatingCountry: "US",
      selectedChannels: ["a2p10dlc"],
      a2p10dlc: {
        ...onboardingFixture().a2p10dlc,
        status: "approved",
        trustProductSid: "BUprofile",
        brandSid: "BNbrand",
        campaignSid: "QEcampaign",
      },
    });
    await client`update workspace set twilio_data = ${client.json({ onboarding: state })} where id = ${workspaceId}::uuid`;
    invalidate(workspaceId);
    const predicates = await import("@/lib/messaging-onboarding/predicates");
    const loaded = await onboarding.getWorkspaceMessagingOnboardingState({
      workspaceId,
    });
    expect(
      predicates.predicatePassed("a2p_approved", {
        onboarding: loaded,
        workspaceNumbers: [],
      }),
    ).toBe(false);
    await onboarding.updateWorkspaceMessagingOnboardingState({
      workspaceId,
      actorUserId: null,
      updates: {
        a2p10dlc: {
          messagingProfileEndUserSid: "ITenduser",
          messagingProfileStatus: "ready",
        },
      },
    });
    expect(
      predicates.predicatePassed("a2p_approved", {
        onboarding: await onboarding.getWorkspaceMessagingOnboardingState({
          workspaceId,
        }),
        workspaceNumbers: [],
      }),
    ).toBe(true);
    await onboarding.updateWorkspaceMessagingOnboardingState({
      workspaceId,
      actorUserId: null,
      updates: { a2p10dlc: { messagingProfileStatus: "action_needed" } },
    });
    expect(
      predicates.predicatePassed("a2p_approved", {
        onboarding: await onboarding.getWorkspaceMessagingOnboardingState({
          workspaceId,
        }),
        workspaceNumbers: [],
      }),
    ).toBe(false);
  });
  test("fresh-row partial resource writes keep both IDs and the business data", async () => {
    const current = await onboarding.getWorkspaceMessagingOnboardingState({
      workspaceId,
    });
    await onboarding.updateWorkspaceMessagingOnboardingState({
      workspaceId,
      actorUserId: null,
      updates: {
        businessProfile: {
          ...current.businessProfile,
          a2pCompanyType: "public",
          a2pStockExchange: "TSX",
          a2pStockTicker: "ACME",
          a2pBrandContactEmail: "jordan@acme.example",
        },
      },
    });
    await Promise.all([
      onboarding.updateWorkspaceMessagingOnboardingState({
        workspaceId,
        actorUserId: null,
        updates: { a2p10dlc: { trustProductSid: "BUprofile" } },
      }),
      onboarding.updateWorkspaceMessagingOnboardingState({
        workspaceId,
        actorUserId: null,
        updates: { a2p10dlc: { messagingProfileEndUserSid: "ITenduser" } },
      }),
    ]);
    const loaded = await onboarding.getWorkspaceMessagingOnboardingState({
      workspaceId,
    });
    expect(loaded.a2p10dlc).toMatchObject({
      trustProductSid: "BUprofile",
      messagingProfileEndUserSid: "ITenduser",
    });
    expect(loaded.businessProfile).toMatchObject({
      a2pCompanyType: "public",
      a2pStockExchange: "TSX",
      a2pStockTicker: "ACME",
      a2pBrandContactEmail: "jordan@acme.example",
    });
  });
  test("readiness write rejects changed inputs inside the locked fresh-row merge", async () => {
    const previous = await onboarding.getWorkspaceMessagingOnboardingState({
      workspaceId,
    });
    await onboarding.updateWorkspaceMessagingOnboardingState({
      workspaceId,
      actorUserId: null,
      updates: {
        businessProfile: {
          ...previous.businessProfile,
          a2pCompanyType: "private",
        },
        a2p10dlc: {
          trustProductSid: "BUprofile",
          messagingProfileEndUserSid: "ITenduser",
        },
      },
    });
    const snapshot = await onboarding.getWorkspaceMessagingOnboardingState({
      workspaceId,
    });
    await onboarding.updateWorkspaceMessagingOnboardingState({
      workspaceId,
      actorUserId: null,
      updates: {
        businessProfile: {
          ...snapshot.businessProfile,
          a2pCompanyType: "public",
        },
      },
    });
    await expect(
      onboarding.updateWorkspaceMessagingOnboardingState({
        workspaceId,
        actorUserId: null,
        expectedA2pBusinessProfile: snapshot.businessProfile,
        updates: { a2p10dlc: { messagingProfileStatus: "ready" } },
      }),
    ).rejects.toThrow("changed during preparation");
    const loaded = await onboarding.getWorkspaceMessagingOnboardingState({
      workspaceId,
    });
    expect(loaded.businessProfile.a2pCompanyType).toBe("public");
    expect(loaded.a2p10dlc).toMatchObject({
      trustProductSid: "BUprofile",
      messagingProfileEndUserSid: "ITenduser",
      messagingProfileStatus: "not_started",
    });
    await onboarding.updateWorkspaceMessagingOnboardingState({
      workspaceId,
      actorUserId: null,
      expectedA2pBusinessProfile: loaded.businessProfile,
      updates: { a2p10dlc: { messagingProfileStatus: "ready" } },
    });
    expect(
      (await onboarding.getWorkspaceMessagingOnboardingState({ workspaceId }))
        .a2p10dlc.messagingProfileStatus,
    ).toBe("ready");
  });
  test.each(["trustProductSid", "messagingProfileEndUserSid"] as const)(
    "readiness rejects a changed %s and accepts the current resource pair",
    async (changedField) => {
      const original = {
        trustProductSid: "BUoriginal",
        messagingProfileEndUserSid: "IToriginal",
      };
      await onboarding.updateWorkspaceMessagingOnboardingState({
        workspaceId,
        actorUserId: null,
        updates: { a2p10dlc: original },
      });
      await onboarding.updateWorkspaceMessagingOnboardingState({
        workspaceId,
        actorUserId: null,
        updates: { a2p10dlc: { [changedField]: "replacement" } },
      });
      await expect(
        onboarding.updateWorkspaceMessagingOnboardingState({
          workspaceId,
          actorUserId: null,
          expectedA2pResourceSids: original,
          updates: { a2p10dlc: { messagingProfileStatus: "ready" } },
        }),
      ).rejects.toThrow("resources changed during preparation");
      const loaded = await onboarding.getWorkspaceMessagingOnboardingState({
        workspaceId,
      });
      expect(loaded.a2p10dlc[changedField]).toBe("replacement");
      expect(loaded.a2p10dlc.messagingProfileStatus).toBe("not_started");
      await onboarding.updateWorkspaceMessagingOnboardingState({
        workspaceId,
        actorUserId: null,
        expectedA2pResourceSids: { ...original, [changedField]: "replacement" },
        updates: { a2p10dlc: { messagingProfileStatus: "ready" } },
      });
      expect(
        (await onboarding.getWorkspaceMessagingOnboardingState({ workspaceId }))
          .a2p10dlc.messagingProfileStatus,
      ).toBe("ready");
    },
  );
  test("the Trust Product callback SID resolves only its actual workspace", async () => {
    const productSid = `BU${workspaceId.replaceAll("-", "")}`;
    await onboarding.updateWorkspaceMessagingOnboardingState({
      workspaceId,
      actorUserId: null,
      updates: { a2p10dlc: { trustProductSid: productSid } },
    });
    const { findWorkspaceIdByComplianceSid } =
      await import("@/lib/twilio-compliance-webhook.server");
    expect(await findWorkspaceIdByComplianceSid(productSid)).toBe(workspaceId);
    expect(
      await findWorkspaceIdByComplianceSid(
        `BU${randomUUID().replaceAll("-", "")}`,
      ),
    ).toBeNull();
  });
  test.each([false, true])(
    "Trust Product rejection callback persists a barrier only after signature verification: rejected=%s",
    async (denySignature) => {
      const productSid = `BU${workspaceId.replaceAll("-", "")}`;
      const brandSid = `BN${workspaceId.replaceAll("-", "")}`;
      const campaignSid = `QE${workspaceId.replaceAll("-", "")}`;
      const initial = onboardingFixture({
        operatingCountry: "US",
        selectedChannels: ["a2p10dlc"],
        messagingService: {
          ...onboardingFixture().messagingService,
          serviceSid: "MGfixture",
        },
        a2p10dlc: {
          ...onboardingFixture().a2p10dlc,
          status: "approved",
          trustProductSid: productSid,
          messagingProfileEndUserSid: "ITfixture",
          messagingProfileStatus: "ready",
          brandSid,
          campaignSid,
        },
      });
      await client`update workspace set twilio_data = ${client.json({ marker: "keep", onboarding: initial })} where id = ${workspaceId}::uuid`;
      invalidate(workspaceId);
      const transport = new RequestClient();
      const request = vi
        .spyOn(transport, "request")
        .mockImplementation(async (input) => {
          let body: unknown;
          if (input.uri.includes("/TrustProducts/"))
            body = {
              sid: productSid,
              policy_sid: "RNb0d4771c2c98518d916a3d4cd70a8f8b",
              status: "twilio-rejected",
            };
          else if (input.uri.includes("/BrandRegistrations/"))
            body = { sid: brandSid, status: "APPROVED" };
          else if (input.uri.includes("/Compliance/Usa2p/"))
            body = { sid: campaignSid, campaign_status: "VERIFIED" };
          else throw new Error("Unexpected callback provider read");
          return { statusCode: 200, headers: {}, body: JSON.stringify(body) };
        });
      callbackSdk = new Twilio(`AC${"1".repeat(32)}`, "synthetic-token", {
        httpClient: transport,
      });
      if (denySignature)
        signature.mockResolvedValue(new Response("Forbidden", { status: 403 }));
      const { action } =
        await import("@/routes/api+/twilio/trusthub/status.action.server");
      const form = new FormData();
      form.set("Sid", productSid);
      form.set("Status", "twilio-rejected");
      const url = new URL("https://callcaster.test/api/twilio/trusthub/status");
      const result = await asRouteResponse(
        action({
          request: new Request(url, { method: "POST", body: form }),
          url,
          params: {},
          context: new RouterContextProvider(),
        }),
      );
      expect(signature).toHaveBeenCalledWith(expect.any(Request), {
        workspaceId,
      });
      const loaded = await onboarding.getWorkspaceMessagingOnboardingState({
        workspaceId,
      });
      if (denySignature) {
        expect(result.status).toBe(403);
        expect(request).not.toHaveBeenCalled();
        expect(loaded.a2p10dlc).toMatchObject({
          messagingProfileStatus: "ready",
          status: "approved",
        });
      } else {
        expect(result.status).toBe(200);
        expect(await result.json()).toEqual({ ok: true, resolved: true });
        expect(loaded.a2p10dlc).toMatchObject({
          messagingProfileStatus: "action_needed",
          status: "rejected",
          trustProductSid: productSid,
          brandSid,
          campaignSid,
        });
        expect(loaded.reviewState.lastError).toContain("not accepted");
        const { predicatePassed } =
          await import("@/lib/messaging-onboarding/predicates");
        expect(
          predicatePassed("a2p_approved", {
            onboarding: loaded,
            workspaceNumbers: [],
          }),
        ).toBe(false);
      }
      expect(
        (
          await onboarding.getWorkspaceMessagingOnboardingState({
            workspaceId: foreignId,
          })
        ).businessProfile.a2pCompanyType,
      ).toBe("government");
    },
  );
});
