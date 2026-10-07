import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * #2143: `syncWorkspaceA2pStatus` seeded each per-resource status from the
 * *aggregate* stored status, then merged back to the aggregate when the two did
 * not agree. The aggregate is a derived value, so deriving from it inverts the
 * direction of truth and makes the state monotonic — it can only ever move
 * toward `approved`, never away.
 *
 * The dangerous case needs only a brand. With `campaignSid` absent,
 * `campaignStatus` is seeded `approved` from the stored aggregate, so a brand
 * that re-enters review can never demote anything.
 */
vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  loadWorkspaceTwilioData: vi.fn(),
  mergeWorkspaceTwilioData: vi.fn(),
  getWorkspaceMessagingOnboardingFromTwilioData: vi.fn(),
  mergeWorkspaceMessagingOnboardingState: vi.fn(),
  fetchBrand: vi.fn(),
  fetchCampaign: vi.fn(),
  createWorkspaceTwilioClient: vi.fn(),
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// Spread the original: a literal factory freezes the module's export surface,
// so adding an export later would fail every test in this file with an
// unrelated error. `check:test-mocks` enforces this.
vi.mock("@/lib/logger.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logger.server")>()),
  logger: mocks.logger,
}));
vi.mock("@/lib/merge-workspace-twilio-data.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/merge-workspace-twilio-data.server")
  >()),
  loadWorkspaceTwilioData: (...a: unknown[]) =>
    mocks.loadWorkspaceTwilioData(...a),
  mergeWorkspaceTwilioData: (...a: unknown[]) =>
    mocks.mergeWorkspaceTwilioData(...a),
}));
vi.mock("@/lib/messaging-onboarding.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/messaging-onboarding.server")>()),
  getWorkspaceMessagingOnboardingFromTwilioData: (...a: unknown[]) =>
    mocks.getWorkspaceMessagingOnboardingFromTwilioData(...a),
  mergeWorkspaceMessagingOnboardingState: (...a: unknown[]) =>
    mocks.mergeWorkspaceMessagingOnboardingState(...a),
}));
vi.mock("@/lib/twilio-client.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/twilio-client.server")>()),
  createWorkspaceTwilioClient: (...a: unknown[]) => mocks.createWorkspaceTwilioClient(...a),
}));

import {
  mergeA2pStatus,
  syncWorkspaceA2pStatus,
} from "@/lib/twilio-a2p-status-sync.server";

const WORKSPACE_ID = "3b6f0a52-6f5e-4b2d-9d55-000000000001";

/**
 * The onboarding state as stored. `status` is the aggregate the bug seeded from.
 */
function storedOnboarding(overrides: Record<string, unknown> = {}) {
  return {
    status: "approved",
    a2p10dlc: {
      status: "approved",
      brandSid: "BR00000000000000000000000000000001",
      campaignSid: "MG00000000000000000000000000000001",
      rejectionReason: null,
      messagingProfileStatus: "ready",
      trustProductSid: "BUprofile",
      ...overrides,
    },
    messagingService: { serviceSid: "MG00000000000000000000000000000002" },
  };
}

/** The merged state the sync wrote, i.e. what a later read of the gate sees. */
function writtenStatus(): string | null {
  const [, update] =
    mocks.mergeWorkspaceMessagingOnboardingState.mock.calls.at(-1) ?? [];
  return (
    (update as { a2p10dlc?: { status?: string } } | undefined)?.a2p10dlc
      ?.status ?? null
  );
}

function wire(
  options: {
    onboarding?: Record<string, unknown>;
    brand?: { status: string; failureReason?: string } | null;
    campaign?: { campaignStatus: string } | null;
  } = {},
) {
  const onboarding = options.onboarding ?? storedOnboarding();
  mocks.loadWorkspaceTwilioData.mockResolvedValue({});
  mocks.getWorkspaceMessagingOnboardingFromTwilioData.mockReturnValue(
    onboarding,
  );
  // The real merge is a deep merge over a2p10dlc; this reproduces that shape
  // closely enough that writtenStatus() reads the value the sync computed.
  mocks.mergeWorkspaceMessagingOnboardingState.mockImplementation(
    (_current: unknown, update: Record<string, any>) => ({
      ...(onboarding as object),
      ...update,
      a2p10dlc: { ...(onboarding as any).a2p10dlc, ...(update.a2p10dlc ?? {}) },
    }),
  );
  mocks.mergeWorkspaceTwilioData.mockImplementation(
    async (_workspaceId, merge) => merge({}),
  );
  mocks.createWorkspaceTwilioClient.mockResolvedValue({
    trusthub: {
      v1: {
        trustProducts: () => ({
          fetch: async () => ({
            sid: "BUprofile",
            policySid: "RNb0d4771c2c98518d916a3d4cd70a8f8b",
            status: "twilio-approved",
          }),
        }),
      },
    },
    messaging: {
      v1: {
        brandRegistrations: (sid: string) => ({
          fetch: async () => {
            if (!options.brand) throw new Error("brand not fetched");
            return options.brand;
          },
        }),
        services: (_serviceSid: string) => ({
          usAppToPerson: (sid: string) => ({
            fetch: async () => {
              if (!options.campaign) throw new Error("campaign not fetched");
              return options.campaign;
            },
          }),
        }),
      },
    },
  });
  mocks.logger.error.mockReset();
}

/**
 * The merge on its own, with no database and no Twilio client.
 *
 * The two "no second resource" cases are the ones the integration tests above
 * cannot distinguish: a brand-only workspace and a workspace whose campaign read
 * failed look identical from outside unless the absence is asserted directly.
 * Both are one line here and impossible to confuse.
 */
describe("mergeA2pStatus — the aggregate, from authoritative reads only (#2143)", () => {
  const A = "approved" as const;
  const R = "in_review" as const;
  const J = "rejected" as const;

  test("an existing resource that was never read is in_review, not approved", () => {
    // The default that keeps the gate shut. This is the mutation that the
    // integration tests could not catch: flipping it to `approved` lets a
    // campaign that was never read mask a brand that is in review.
    expect(
      mergeA2pStatus({
        brand: { fetched: R, exists: true },
        campaign: { fetched: null, exists: true },
      }),
    ).toBe(R);
  });

  test("an existing resource that was never read blocks a promotion", () => {
    expect(
      mergeA2pStatus({
        brand: { fetched: A, exists: true },
        campaign: { fetched: null, exists: true },
      }),
    ).not.toBe(A);
  });

  test.each([
    {
      brand: { fetched: A, exists: true },
      campaign: { fetched: null, exists: false },
    },
    {
      brand: { fetched: null, exists: false },
      campaign: { fetched: A, exists: true },
    },
    {
      brand: { fetched: A, exists: true },
      campaign: { fetched: A, exists: false },
    },
    {
      brand: { fetched: A, exists: true },
      campaign: { fetched: J, exists: false },
    },
  ])("both required resources must exist before approval: %j", (resources) => {
    expect(mergeA2pStatus(resources)).toBe(R);
  });

  test("rejection wins over everything else", () => {
    for (const brand of [A, R, J] as const) {
      for (const campaign of [A, R, J] as const) {
        if (brand === J || campaign === J) {
          expect(
            mergeA2pStatus({
              brand: { fetched: brand, exists: true },
              campaign: { fetched: campaign, exists: true },
            }),
          ).toBe(J);
        }
      }
    }
  });

  test("anything short of unanimous approval is in_review", () => {
    expect(
      mergeA2pStatus({
        brand: { fetched: R, exists: true },
        campaign: { fetched: A, exists: true },
      }),
    ).toBe(R);
    expect(
      mergeA2pStatus({
        brand: { fetched: A, exists: true },
        campaign: { fetched: R, exists: true },
      }),
    ).toBe(R);
  });

  test("unanimous approval promotes", () => {
    expect(
      mergeA2pStatus({
        brand: { fetched: A, exists: true },
        campaign: { fetched: A, exists: true },
      }),
    ).toBe(A);
  });

  test("no resources at all is in_review rather than approved", () => {
    // Defensive: the caller returns early, so this never reaches a write. It
    // must not be the one combination that reports approval.
    expect(
      mergeA2pStatus({
        brand: { fetched: null, exists: false },
        campaign: { fetched: null, exists: false },
      }),
    ).toBe(R);
  });
});

describe("A2P status sync — a per-resource status is never seeded from the aggregate (#2143)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test.each(["brandSid", "campaignSid", "trustProductSid", "serviceSid"])(
    "a changed %s returns the fresh state without writing old provider results",
    async (field) => {
      const previous = storedOnboarding();
      const fresh = {
        ...previous,
        a2p10dlc: {
          ...previous.a2p10dlc,
          messagingProfileStatus: "not_started",
        },
        messagingService: { ...previous.messagingService },
      };
      if (field === "serviceSid")
        fresh.messagingService.serviceSid = "MGchanged";
      else Object.assign(fresh.a2p10dlc, { [field]: "changed" });
      wire({
        onboarding: previous,
        brand: { status: "approved" },
        campaign: { campaignStatus: "approved" },
      });
      mocks.getWorkspaceMessagingOnboardingFromTwilioData
        .mockReturnValueOnce(previous)
        .mockReturnValueOnce(fresh);
      const result = await syncWorkspaceA2pStatus({
        workspaceId: WORKSPACE_ID,
        actorUserId: null,
      });
      expect(
        mocks.mergeWorkspaceMessagingOnboardingState,
      ).not.toHaveBeenCalled();
      expect(result).toBe(fresh);
      expect(result.a2p10dlc.messagingProfileStatus).toBe("not_started");
    },
  );

  test("a brand re-entering review demotes the stored status", async () => {
    wire({
      brand: { status: "in_review" },
      campaign: { campaignStatus: "approved" },
    });

    await syncWorkspaceA2pStatus({
      workspaceId: WORKSPACE_ID,
      actorUserId: null,
    });

    // Both resources were fetched, and only one is approved, so the aggregate
    // cannot be `approved`. The old code returned the *previous* status here.
    expect(writtenStatus()).toBe("in_review");
  });

  test("a brand re-entering review demotes with no campaign at all", async () => {
    // The case the issue leads with. `campaignSid` absent means the campaign is
    // never fetched, so seeding it `approved` from the aggregate is what pins
    // the state open.
    wire({
      onboarding: storedOnboarding({ campaignSid: null }),
      brand: { status: "in_review" },
    });

    await syncWorkspaceA2pStatus({
      workspaceId: WORKSPACE_ID,
      actorUserId: null,
    });

    expect(writtenStatus()).toBe("in_review");
  });

  test("a rejected brand demotes to rejected", async () => {
    wire({
      brand: { status: "failed" },
      campaign: { campaignStatus: "approved" },
    });

    await syncWorkspaceA2pStatus({
      workspaceId: WORKSPACE_ID,
      actorUserId: null,
    });

    expect(writtenStatus()).toBe("rejected");
  });

  test("a rejected campaign demotes to rejected", async () => {
    wire({
      brand: { status: "approved" },
      campaign: { campaignStatus: "rejected" },
    });

    await syncWorkspaceA2pStatus({
      workspaceId: WORKSPACE_ID,
      actorUserId: null,
    });

    expect(writtenStatus()).toBe("rejected");
  });

  test("both fetched as approved promotes", async () => {
    wire({
      onboarding: storedOnboarding({ status: "in_review" }),
      brand: { status: "approved" },
      campaign: { campaignStatus: "approved" },
    });

    await syncWorkspaceA2pStatus({
      workspaceId: WORKSPACE_ID,
      actorUserId: null,
    });

    expect(writtenStatus()).toBe("approved");
  });

  test("a brand that is no longer approved never contributes `approved`", async () => {
    // A brand moving approved -> provisioning is `mapBrandStatus`'s default, so
    // an unrecognised provider status must demote rather than pass through.
    wire({
      brand: { status: "something_new" },
      campaign: { campaignStatus: "approved" },
    });

    await syncWorkspaceA2pStatus({
      workspaceId: WORKSPACE_ID,
      actorUserId: null,
    });

    expect(writtenStatus()).not.toBe("approved");
  });

  test("an unfetched resource does not hold the aggregate open", async () => {
    // The campaign fetch throws. The old code caught it, seeded the campaign
    // from the aggregate, and wrote the old status back with a fresh timestamp.
    wire({ onboarding: storedOnboarding(), brand: { status: "in_review" } });
    mocks.createWorkspaceTwilioClient.mockResolvedValue({
      trusthub: {
        v1: {
          trustProducts: () => ({
            fetch: async () => ({
              sid: "BUprofile",
              policySid: "RNb0d4771c2c98518d916a3d4cd70a8f8b",
              status: "twilio-approved",
            }),
          }),
        },
      },
      messaging: {
        v1: {
          brandRegistrations: () => ({
            fetch: async () => ({ status: "in_review" }),
          }),
          services: () => ({
            usAppToPerson: () => ({
              fetch: async () => {
                throw new Error("campaign fetch failed");
              },
            }),
          }),
        },
      },
    });

    await syncWorkspaceA2pStatus({
      workspaceId: WORKSPACE_ID,
      actorUserId: null,
    });

    // The brand is authoritative and it is not approved, so the gate must close
    // even though the campaign could not be read.
    expect(writtenStatus()).toBe("in_review");
  });

  test("a fetch failure that hides every resource leaves the state unchanged", async () => {
    // Nothing authoritative was read, so the honest outcome is to leave the
    // stored state alone rather than guess. Guessing conservatively here would
    // drop a live workspace's gate on a transient network error.
    wire({ onboarding: storedOnboarding({ trustProductSid: null }) });
    mocks.createWorkspaceTwilioClient.mockResolvedValue({
      trusthub: {
        v1: {
          trustProducts: () => ({
            fetch: async () => ({
              sid: "BUprofile",
              policySid: "RNb0d4771c2c98518d916a3d4cd70a8f8b",
              status: "twilio-approved",
            }),
          }),
        },
      },
      messaging: {
        v1: {
          brandRegistrations: () => ({
            fetch: async () => {
              throw new Error("brand fetch failed");
            },
          }),
          services: () => ({
            usAppToPerson: () => ({
              fetch: async () => {
                throw new Error("campaign fetch failed");
              },
            }),
          }),
        },
      },
    });

    const result = await syncWorkspaceA2pStatus({
      workspaceId: WORKSPACE_ID,
      actorUserId: null,
    });

    // No write at all, so `lastSyncedAt` is not bumped and the record does not
    // look freshly verified.
    expect(mocks.mergeWorkspaceTwilioData).not.toHaveBeenCalled();
    expect((result as any).a2p10dlc.status).toBe("approved");
  });

  test("with no brand and no campaign, nothing is fetched and nothing is written", async () => {
    wire({
      onboarding: storedOnboarding({
        brandSid: null,
        campaignSid: null,
        trustProductSid: null,
      }),
    });

    const result = await syncWorkspaceA2pStatus({
      workspaceId: WORKSPACE_ID,
      actorUserId: null,
    });

    expect(mocks.createWorkspaceTwilioClient).not.toHaveBeenCalled();
    expect(mocks.mergeWorkspaceTwilioData).not.toHaveBeenCalled();
    expect((result as any).a2p10dlc.status).toBe("approved");
  });

  test("an approved brand without a campaign remains in review", async () => {
    // Brand approval is not a completed campaign registration.
    wire({
      onboarding: storedOnboarding({ status: "in_review", campaignSid: null }),
      brand: { status: "approved" },
    });

    await syncWorkspaceA2pStatus({
      workspaceId: WORKSPACE_ID,
      actorUserId: null,
    });

    expect(writtenStatus()).toBe("in_review");
  });

  test("provider VERIFIED campaign and approved brand establish approval", async () => {
    wire({
      brand: { status: "APPROVED" },
      campaign: { campaignStatus: "VERIFIED" },
    });
    await syncWorkspaceA2pStatus({
      workspaceId: WORKSPACE_ID,
      actorUserId: null,
    });
    expect(writtenStatus()).toBe("approved");
  });

  test("provider IN_PROGRESS campaign remains in review", async () => {
    wire({
      brand: { status: "APPROVED" },
      campaign: { campaignStatus: "IN_PROGRESS" },
    });
    await syncWorkspaceA2pStatus({
      workspaceId: WORKSPACE_ID,
      actorUserId: null,
    });
    expect(writtenStatus()).toBe("in_review");
  });

  test("the failure reason is carried over from a rejected brand", async () => {
    wire({
      brand: { status: "failed", failureReason: "Business identity mismatch" },
      campaign: { campaignStatus: "approved" },
    });

    await syncWorkspaceA2pStatus({
      workspaceId: WORKSPACE_ID,
      actorUserId: null,
    });

    const [, update] =
      mocks.mergeWorkspaceMessagingOnboardingState.mock.calls.at(-1) ?? [];
    expect((update as any).a2p10dlc.rejectionReason).toBe(
      "Business identity mismatch",
    );
  });
});
