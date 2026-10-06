import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { onboardingFixture } from "../fixtures/onboarding";

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const workspaceId = randomUUID();
const foreignId = randomUUID();

suite("stored explicit toll-free opt-in (#2145)", () => {
  let client: postgres.Sql;
  let onboarding: typeof import("@/lib/messaging-onboarding/persistence.server");
  let actions: typeof import("@/lib/onboarding-actions.server");
  let invalidate: typeof import("@/lib/merge-workspace-twilio-data.server").invalidateWorkspaceTwilioData;
  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Toll-free selection tests need a database");
    process.env.DATABASE_URL = databaseUrl;
    client = postgres(databaseUrl, { max: 1 });
    for (const id of [workspaceId, foreignId]) {
      await client`insert into workspace (id, name, twilio_data) values (${id}::uuid, 'Opt-in fixture', '{}'::jsonb)`;
    }
    onboarding = await import("@/lib/messaging-onboarding/persistence.server");
    actions = await import("@/lib/onboarding-actions.server");
    ({ invalidateWorkspaceTwilioData: invalidate } = await import("@/lib/merge-workspace-twilio-data.server"));
  });
  beforeEach(async () => {
    const state = onboardingFixture();
    await client`update workspace set twilio_data = ${client.json({ marker: "keep", onboarding: state })} where id = ${workspaceId}::uuid`;
    await client`update workspace set twilio_data = ${client.json({ marker: "foreign", onboarding: { ...state, businessProfile: { ...state.businessProfile, tollFreeOptInType: "VIA_TEXT" } } })} where id = ${foreignId}::uuid`;
    invalidate(workspaceId); invalidate(foreignId);
  });
  afterAll(async () => {
    try {
      if (client) await client`delete from workspace where id in (${workspaceId}::uuid, ${foreignId}::uuid)`;
    } finally {
      await client?.end();
      const { pool, directPool } = await import("@/server/db");
      await Promise.all([pool.end(), directPool.end()]);
    }
  });
  test.each(["VERBAL", "WEB_FORM", "PAPER_FORM", "VIA_TEXT", "MOBILE_QR_CODE", "IMPORT", "IMPORT_PLEASE_REPLACE"] as const)("%s survives a form save, database read and unrelated partial save", async (selection) => {
    const current = await onboarding.getWorkspaceMessagingOnboardingState({ workspaceId });
    const form = new FormData(); form.set("tollFreeOptInType", selection);
    await onboarding.updateWorkspaceMessagingOnboardingState({ workspaceId, actorUserId: null, updates: { businessProfile: actions.buildBusinessProfile(form, current.businessProfile) } });
    const loaded = await onboarding.getWorkspaceMessagingOnboardingState({ workspaceId });
    expect(loaded.businessProfile.tollFreeOptInType).toBe(selection);
    const other = new FormData(); other.set("useCaseSummary", "Appointment reminders");
    await onboarding.updateWorkspaceMessagingOnboardingState({ workspaceId, actorUserId: null, updates: { businessProfile: actions.buildBusinessProfile(other, loaded.businessProfile) } });
    const [row] = await client`select twilio_data from workspace where id = ${workspaceId}::uuid`;
    expect(row.twilio_data.marker).toBe("keep");
    expect(row.twilio_data.onboarding.businessProfile).toMatchObject({ tollFreeOptInType: selection, useCaseSummary: "Appointment reminders" });
    expect((await onboarding.getWorkspaceMessagingOnboardingState({ workspaceId: foreignId })).businessProfile.tollFreeOptInType).toBe("VIA_TEXT");
  });
  test.each([undefined, "NOT_VERBAL", "web_form", 123])("legacy/malformed stored value %s stays unselected despite prose", async (value) => {
    const state = onboardingFixture();
    await client`update workspace set twilio_data = ${client.json({ onboarding: { ...state, businessProfile: { ...state.businessProfile, tollFreeOptInType: value, optInWorkflow: "We do not accept verbal consent." }, tollFreeVerification: { optInType: "WEB_FORM" } } })} where id = ${workspaceId}::uuid`;
    invalidate(workspaceId);
    expect((await onboarding.getWorkspaceMessagingOnboardingState({ workspaceId })).businessProfile.tollFreeOptInType).toBeNull();
  });
  test("unrelated profile updates retain private metadata and leave the foreign workspace intact", async () => {
    const current = await onboarding.getWorkspaceMessagingOnboardingState({ workspaceId });
    const form = new FormData(); form.set("legalBusinessName", "Updated Clinic");
    await onboarding.updateWorkspaceMessagingOnboardingState({ workspaceId, actorUserId: null, updates: { businessProfile: actions.buildBusinessProfile(form, current.businessProfile) } });
    const [owned] = await client`select twilio_data from workspace where id = ${workspaceId}::uuid`;
    const [foreign] = await client`select twilio_data from workspace where id = ${foreignId}::uuid`;
    expect(owned.twilio_data).toMatchObject({ marker: "keep", onboarding: { businessProfile: { legalBusinessName: "Updated Clinic" } } });
    expect(foreign.twilio_data).toMatchObject({ marker: "foreign", onboarding: { businessProfile: { tollFreeOptInType: "VIA_TEXT", legalBusinessName: "Acme" } } });
  });
});
