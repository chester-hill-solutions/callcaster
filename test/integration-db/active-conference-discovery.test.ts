import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  url: process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL,
}));

const suite = fixture.url ? describe : describe.skip;

// Leave Campaign with no client-held conference name falls back to discovery,
// which reads this query. It compared the `call_status` enum to a `text[]`, so
// Postgres rejected it with "operator does not exist: call_status = text" and
// the route answered 500 — the agent could not leave and the dialer kept
// dialling. Only the real Postgres tier can catch that; the route tests stub
// this helper (#2095).
suite("active conference discovery for one user (#2095)", () => {
  const workspace = randomUUID();
  const otherWorkspace = randomUUID();
  const agent = randomUUID();
  const otherAgent = randomUUID();

  const liveStatuses = ["initiated", "queued", "ringing", "in-progress"] as const;
  const terminalStatuses = [
    "canceled",
    "completed",
    "failed",
    "busy",
    "no-answer",
  ] as const;

  let sql: postgres.Sql;
  let telephonyDb: typeof import("@/lib/telephony-db.server");
  let campaign: number;
  let otherCampaign: number;
  let contact: number;
  let otherContact: number;

  const sid = () => `CA${randomUUID().replaceAll("-", "")}`;

  async function seedAttempt(
    workspaceId: string,
    campaignId: number,
    contactId: number,
    userId: string,
  ): Promise<number> {
    const [row] =
      await sql`insert into public.outreach_attempt (workspace, campaign_id, contact_id, user_id, disposition)
        values (${workspaceId}, ${campaignId}, ${contactId}, ${userId}, 'pending') returning id`;
    return Number(row.id);
  }

  async function seedCall(input: {
    workspaceId: string;
    campaignId: number;
    contactId: number;
    attemptId: number;
    status: string;
    conferenceId: string | null;
  }): Promise<void> {
    await sql`insert into public.call
        (sid, workspace, campaign_id, contact_id, outreach_attempt_id, status, conference_id)
      values (${sid()}, ${input.workspaceId}, ${input.campaignId}, ${input.contactId}, ${input.attemptId}, ${input.status}, ${input.conferenceId})`;
  }

  beforeAll(async () => {
    if (!fixture.url) throw new Error("Database URL required");
    process.env.DATABASE_URL = process.env.DATABASE_DIRECT_URL = fixture.url;
    sql = postgres(fixture.url, { max: 1, onnotice: () => {} });

    for (const userId of [agent, otherAgent]) {
      await sql`insert into public."user" (id, username) values (${userId}, ${`conference-${userId}`})`;
    }
    for (const [workspaceId, name] of [
      [workspace, "Conference discovery fixture"],
      [otherWorkspace, "Conference discovery foreign fixture"],
    ] as const) {
      await sql`insert into public.workspace (id, name) values (${workspaceId}, ${name})`;
    }

    const [ownCampaign] =
      await sql`insert into public.campaign (workspace, title, type, status, dial_type, dial_ratio, group_household_queue)
        values (${workspace}, 'Conference discovery', 'live_call', 'running', 'predictive', 1, false) returning id`;
    campaign = Number(ownCampaign.id);

    const [foreignCampaign] =
      await sql`insert into public.campaign (workspace, title, type, status, dial_type, dial_ratio, group_household_queue)
        values (${otherWorkspace}, 'Conference discovery foreign', 'live_call', 'running', 'predictive', 1, false) returning id`;
    otherCampaign = Number(foreignCampaign.id);

    const [ownContact] =
      await sql`insert into public.contact (workspace, phone) values (${workspace}, '+15551230011') returning id`;
    contact = Number(ownContact.id);

    const [foreignContact] =
      await sql`insert into public.contact (workspace, phone) values (${otherWorkspace}, '+15551230012') returning id`;
    otherContact = Number(foreignContact.id);

    telephonyDb = await import("@/lib/telephony-db.server");
  });

  afterAll(async () => {
    const errors: unknown[] = [];
    try {
      if (sql) {
        await sql`delete from public.call where workspace in (${workspace}, ${otherWorkspace})`;
        await sql`delete from public.outreach_attempt where workspace in (${workspace}, ${otherWorkspace})`;
        await sql`delete from public.campaign where workspace in (${workspace}, ${otherWorkspace})`;
        await sql`delete from public.contact where workspace in (${workspace}, ${otherWorkspace})`;
        await sql`delete from public.workspace where id in (${workspace}, ${otherWorkspace})`;
        await sql`delete from public."user" where id in (${agent}, ${otherAgent})`;
      }
    } catch (error) {
      errors.push(error);
    }
    try {
      await sql?.end({ timeout: 5 });
    } catch (error) {
      errors.push(error);
    }
    if (errors.length) throw new AggregateError(errors, "conference fixture cleanup failed");
  });

  async function reset(): Promise<void> {
    await sql`delete from public.call where workspace in (${workspace}, ${otherWorkspace})`;
    await sql`delete from public.outreach_attempt where workspace in (${workspace}, ${otherWorkspace})`;
  }

  test("returns the conference of every live call the agent owns", async () => {
    await reset();
    const expected: string[] = [];
    for (const status of liveStatuses) {
      const attemptId = await seedAttempt(workspace, campaign, contact, agent);
      const conferenceId = `${agent}~${randomUUID()}`;
      expected.push(conferenceId);
      await seedCall({
        workspaceId: workspace,
        campaignId: campaign,
        contactId: contact,
        attemptId,
        status,
        conferenceId,
      });
    }

    const found = await telephonyDb.findActiveConferenceIdsForUser(workspace, agent);

    expect([...found].sort()).toEqual([...expected].sort());
  });

  test("ignores calls that already ended", async () => {
    await reset();
    for (const status of terminalStatuses) {
      const attemptId = await seedAttempt(workspace, campaign, contact, agent);
      await seedCall({
        workspaceId: workspace,
        campaignId: campaign,
        contactId: contact,
        attemptId,
        status,
        conferenceId: `${agent}~${randomUUID()}`,
      });
    }

    expect(await telephonyDb.findActiveConferenceIdsForUser(workspace, agent)).toEqual([]);
  });

  test("ignores another agent's live call", async () => {
    await reset();
    const attemptId = await seedAttempt(workspace, campaign, contact, otherAgent);
    await seedCall({
      workspaceId: workspace,
      campaignId: campaign,
      contactId: contact,
      attemptId,
      status: "in-progress",
      conferenceId: `${otherAgent}~${randomUUID()}`,
    });

    expect(await telephonyDb.findActiveConferenceIdsForUser(workspace, agent)).toEqual([]);
  });

  test("ignores another workspace's live call", async () => {
    await reset();
    const attemptId = await seedAttempt(otherWorkspace, otherCampaign, otherContact, agent);
    await seedCall({
      workspaceId: otherWorkspace,
      campaignId: otherCampaign,
      contactId: otherContact,
      attemptId,
      status: "in-progress",
      conferenceId: `${agent}~${randomUUID()}`,
    });

    expect(await telephonyDb.findActiveConferenceIdsForUser(workspace, agent)).toEqual([]);
  });

  test("ignores live calls with no conference id", async () => {
    await reset();
    for (const conferenceId of [null, ""]) {
      const attemptId = await seedAttempt(workspace, campaign, contact, agent);
      await seedCall({
        workspaceId: workspace,
        campaignId: campaign,
        contactId: contact,
        attemptId,
        status: "in-progress",
        conferenceId,
      });
    }

    expect(await telephonyDb.findActiveConferenceIdsForUser(workspace, agent)).toEqual([]);
  });

  test("collapses several live calls onto one distinct conference", async () => {
    await reset();
    const conferenceId = `${agent}~${randomUUID()}`;
    for (let index = 0; index < 3; index += 1) {
      const attemptId = await seedAttempt(workspace, campaign, contact, agent);
      await seedCall({
        workspaceId: workspace,
        campaignId: campaign,
        contactId: contact,
        attemptId,
        status: "in-progress",
        conferenceId,
      });
    }

    expect(await telephonyDb.findActiveConferenceIdsForUser(workspace, agent)).toEqual([
      conferenceId,
    ]);
  });
});
