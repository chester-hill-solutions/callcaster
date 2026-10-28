import { randomUUID } from "node:crypto";
import { parse } from "csv-parse/sync";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("SMS report contact external IDs (#2603)", () => {
  const workspace = randomUUID();
  const foreign = randomUUID();
  const sender = "+15551110000";
  const recipient = "+15552220000";
  const missing = "+15553330000";
  const externalId = 'CRM, "alpha"';
  let client: postgres.Sql;
  let pools: typeof import("@/server/db");
  let report: typeof import("@/lib/campaign-sms-report.server");
  let campaign: number;
  let contactId: number;
  let files: Awaited<ReturnType<typeof report.buildCampaignSmsReport>>;
  const previous = { url: process.env.DATABASE_URL, direct: process.env.DATABASE_DIRECT_URL };

  async function message(input: { sid: string; from: string; to: string; direction: string; body: string; contact: number | null; at: string; tenant?: string }) {
    const { sid, from, to, direction, body, contact, at, tenant = workspace } = input;
    await client`insert into message (workspace,sid,"from","to",direction,body,contact_id,campaign_id,status,num_segments,date_created,date_sent)
      values (${tenant},${`${workspace}-${sid}`},${from},${to},${direction},${body},${contact},${direction === "outbound-api" ? campaign : null},'delivered','1',${at},${at})`;
  }

  function rows(artifacts: typeof files, suffix: string) {
    const file = artifacts.find(file => file.filename.endsWith(suffix));
    if (!file || typeof file.body !== "string") throw new Error(`Missing ${suffix}`);
    const parsed: Record<string, string>[] = parse(file.body, { columns: true, bom: true, skip_empty_lines: true });
    return parsed;
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Database required");
    process.env.DATABASE_URL = process.env.DATABASE_DIRECT_URL = databaseUrl;
    client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
    await client`insert into workspace (id,name) values (${workspace},'Report identity fixture'),(${foreign},'Foreign fixture')`;
    const [savedCampaign] = await client`insert into campaign (workspace,title,type,status,caller_id)
      values (${workspace},'Community outreach','message','complete',${sender}) returning id`;
    campaign = Number(savedCampaign.id);
    const [known] = await client`insert into contact (workspace,firstname,surname,phone,external_id)
      values (${workspace},'Ada','Example',${recipient},${externalId}) returning id`;
    contactId = Number(known.id);
    const [withoutId] = await client`insert into contact (workspace,firstname,phone)
      values (${workspace},'No external ID',${missing}) returning id`;
    const [foreignContact] = await client`insert into contact (workspace,firstname,phone,external_id)
      values (${foreign},'Foreign contact',${recipient},'FOREIGN-ID') returning id`;
    await message({ sid: "blast", from: sender, to: recipient, direction: "outbound-api", body: "First send", contact: contactId, at: "2026-10-09T12:00:00Z" });
    await message({ sid: "missing-blast", from: sender, to: missing, direction: "outbound-api", body: "Missing ID send", contact: Number(withoutId.id), at: "2026-10-09T12:00:00Z" });
    await message({ sid: "reply", from: recipient, to: sender, direction: "inbound", body: "Recipient reply", contact: null, at: "2026-10-09T12:01:00Z" });
    await message({ sid: "staff", from: sender, to: recipient, direction: "outbound-reply", body: "Staff reply", contact: null, at: "2026-10-09T12:02:00Z" });
    await message({ sid: "stop", from: recipient, to: sender, direction: "inbound", body: "STOP", contact: null, at: "2026-10-09T12:03:00Z" });
    await message({ sid: "missing-reply", from: missing, to: sender, direction: "inbound", body: "Missing ID reply", contact: null, at: "2026-10-09T12:04:00Z" });
    await message({ sid: "exact-reply", from: recipient, to: sender, direction: "inbound", body: "Exact contact reply", contact: contactId, at: "2026-10-09T12:05:00Z" });
    await message({ sid: "foreign", from: recipient, to: sender, direction: "inbound", body: "Foreign reply", contact: Number(foreignContact.id), at: "2026-10-09T12:01:00Z", tenant: foreign });
    pools = await import("@/server/db");
    report = await import("@/lib/campaign-sms-report.server");
    files = await report.buildCampaignSmsReport(workspace, campaign);
  });

  afterAll(async () => {
    try {
      if (client) {
        await client`delete from message where workspace in (${workspace},${foreign})`;
        await client`delete from campaign where workspace=${workspace}`;
        await client`delete from contact where workspace in (${workspace},${foreign})`;
        await client`delete from workspace where id in (${workspace},${foreign})`;
      }
    } finally {
      await Promise.all([pools?.pool.end({ timeout: 1 }), pools?.directPool.end({ timeout: 1 }), client?.end()]);
      if (previous.url === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous.url;
      if (previous.direct === undefined) delete process.env.DATABASE_DIRECT_URL;
      else process.env.DATABASE_DIRECT_URL = previous.direct;
    }
  });

  test("generated CSVs retain quoted IDs for sends, recipient replies, staff and STOP", () => {
    const messages = rows(files, "-all-messages.csv");
    expect(messages).toHaveLength(7);
    for (const body of ["First send", "Recipient reply", "Staff reply", "STOP", "Exact contact reply"]) {
      expect(messages.find(row => row.body === body)?.external_id).toBe(externalId);
    }
    expect(rows(files, "-opt-outs.csv")[0]).toMatchObject({ body: "STOP", external_id: externalId });
    expect(messages.find(row => row.body === "Recipient reply")).toMatchObject({ direction: "inbound", date_created: "2026-10-09T12:01:00.000Z", contact_name: "Ada Example" });
    expect(messages.find(row => row.body === "Staff reply")?.contact_name).toBe("Unknown");
  });

  test("missing IDs stay empty", () => {
    const messages = rows(files, "-all-messages.csv");
    for (const body of ["Missing ID send", "Missing ID reply"]) expect(messages.find(row => row.body === body)?.external_id).toBe("");
  });

  test("foreign rows stay outside the report", () => {
    const messages = rows(files, "-all-messages.csv");
    expect(messages.some(row => row.body === "Foreign reply")).toBe(false);
    expect(JSON.stringify(files)).not.toContain("FOREIGN-ID");
  });

  test("conflicting legacy IDs leave unlinked replies empty while exact references remain", async () => {
    const [duplicate] = await client`insert into contact (workspace,firstname,phone,external_id)
      values (${workspace},'Legacy duplicate',${recipient},'SECOND-ID') returning id`;
    await message({ sid: "duplicate-blast", from: sender, to: recipient, direction: "outbound-api", body: "Duplicate send", contact: Number(duplicate.id), at: "2026-10-09T12:00:00Z" });
    const updated = await report.buildCampaignSmsReport(workspace, campaign);
    const messages = rows(updated, "-all-messages.csv");
    for (const body of ["Recipient reply", "Staff reply", "STOP"]) expect(messages.find(row => row.body === body)?.external_id).toBe("");
    expect(messages.find(row => row.body === "Exact contact reply")?.external_id).toBe(externalId);
    expect(messages.find(row => row.body === "Duplicate send")?.external_id).toBe("SECOND-ID");
    expect(rows(updated, "-opt-outs.csv")[0].external_id).toBe("");
  });
});
