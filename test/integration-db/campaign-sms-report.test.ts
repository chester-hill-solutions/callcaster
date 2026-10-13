import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("campaign SMS report (#1752)", () => {
  const workspace = randomUUID();
  const foreign = randomUUID();
  const sender = "+15551110000";
  const recipient = "+15552220000";
  const stopRecipient = "+15553330000";
  let client: postgres.Sql;
  let pools: typeof import("@/server/db");
  let report: typeof import("@/lib/campaign-sms-report.server");
  let campaign: number;
  let nextCampaign: number;
  let files: Awaited<ReturnType<typeof report.buildCampaignSmsReport>>;
  const previous = {
    url: process.env.DATABASE_URL,
    direct: process.env.DATABASE_DIRECT_URL,
  };

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Database required");
    process.env.DATABASE_URL = process.env.DATABASE_DIRECT_URL = databaseUrl;
    client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
    await client`insert into workspace (id, name) values (${workspace}, 'SMS report fixture'), (${foreign}, 'Foreign fixture')`;
    const campaigns =
      await client`insert into campaign (workspace,title,type,status,caller_id,start_date)
      values (${workspace},'Community outreach','message','complete',${sender},'2026-10-09'),
      (${workspace},'test next send','message','complete',${sender},'2026-10-10') returning id`;
    campaign = Number(campaigns[0].id);
    nextCampaign = Number(campaigns[1].id);
    pools = await import("@/server/db");
    report = await import("@/lib/campaign-sms-report.server");
    const message = async ({
      sid,
      from,
      to,
      body,
      direction,
      time,
      campaignId = null,
      tenant = workspace,
      error = null,
    }: {
      sid: string;
      from: string;
      to: string;
      body: string;
      direction: string;
      time: string;
      campaignId?: number | null;
      tenant?: string;
      error?: number | null;
    }) => {
      await client`insert into message (workspace,sid,"from","to",body,direction,date_created,date_sent,campaign_id,status,num_segments,error_code)
      values (${tenant},${`${workspace}-${sid}`},${from},${to},${body},${direction},${time},${time},${campaignId},'delivered','1',${error})`;
    };
    await message({
      sid: "before",
      from: recipient,
      to: sender,
      body: "BEFORE SEND",
      direction: "inbound",
      time: "2026-10-09T11:00:00Z",
    });
    await message({
      sid: "blast",
      from: sender,
      to: recipient,
      body: "Please share your view.",
      direction: "outbound-api",
      time: "2026-10-09T12:00:00Z",
      campaignId: campaign,
    });
    await message({
      sid: "stop-blast",
      from: sender,
      to: stopRecipient,
      body: "Please share your view.",
      direction: "outbound-api",
      time: "2026-10-09T12:00:00Z",
      campaignId: campaign,
      tenant: workspace,
      error: 30006,
    });
    await message({
      sid: "reply",
      from: recipient,
      to: sender,
      body: "สวัสดี — café “Yes” 你好 Привет 🙂",
      direction: "inbound",
      time: "2026-10-09T12:01:00Z",
    });
    await message({
      sid: "staff",
      from: sender,
      to: recipient,
      body: "Thank you for your reply.",
      direction: "outbound-reply",
      time: "2026-10-09T12:02:00Z",
    });
    await message({
      sid: "repeat-staff",
      from: sender,
      to: recipient,
      body: "Thank you for your reply.",
      direction: "outbound-reply",
      time: "2026-10-09T12:03:00Z",
    });
    await message({
      sid: "stop",
      from: stopRecipient,
      to: sender,
      body: "STOP",
      direction: "inbound",
      time: "2026-10-09T12:01:00Z",
    });
    await message({
      sid: "wrong-number",
      from: recipient,
      to: "+15559990000",
      body: "WRONG NUMBER",
      direction: "inbound",
      time: "2026-10-09T12:04:00Z",
    });
    await message({
      sid: "foreign",
      from: recipient,
      to: sender,
      body: "FOREIGN WORKSPACE",
      direction: "inbound",
      time: "2026-10-09T12:04:00Z",
      campaignId: null,
      tenant: foreign,
    });
    await message({
      sid: "next-blast",
      from: sender,
      to: recipient,
      body: "TEST BLAST",
      direction: "outbound-api",
      time: "2026-10-10T12:00:00Z",
      campaignId: nextCampaign,
    });
    await message({
      sid: "later",
      from: recipient,
      to: sender,
      body: "LATER CAMPAIGN REPLY",
      direction: "inbound",
      time: "2026-10-10T12:01:00Z",
    });
    await message({
      sid: "later-staff",
      from: sender,
      to: recipient,
      body: "LATER STAFF REPLY",
      direction: "outbound-reply",
      time: "2026-10-10T12:02:00Z",
    });
    await client`update message set date_created='2026-10-09T10:00:00Z' where campaign_id=${campaign}`;
    await client`update message set date_created='2026-10-09T10:00:00Z' where campaign_id=${nextCampaign}`;
    await client`insert into message (workspace,sid,"from","to",body,direction,date_created,campaign_id,status)
      values (${workspace},${`${workspace}-queued-next`},${sender},${stopRecipient},'UNSENT NEXT','outbound-api','2026-10-09T10:00:00Z',${nextCampaign},'queued')`;
    files = await report.buildCampaignSmsReport(workspace, campaign);
    if (process.env.SMS_REPORT_PROOF_PATH) {
      const pdf = files.find((file) => file.contentType === "application/pdf");
      if (!pdf) throw new Error("PDF missing");
      await writeFile(process.env.SMS_REPORT_PROOF_PATH, pdf.body);
    }
  });

  afterAll(async () => {
    const errors: unknown[] = [];
    try {
      if (client) {
        await client`delete from message where workspace in (${workspace},${foreign})`;
        await client`delete from campaign where workspace=${workspace}`;
        await client`delete from workspace where id in (${workspace},${foreign})`;
      }
    } catch (error) {
      errors.push(error);
    } finally {
      const closers = await Promise.allSettled([
        pools?.pool.end({ timeout: 1 }),
        pools?.directPool.end({ timeout: 1 }),
        client?.end(),
      ]);
      if (previous.url === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous.url;
      if (previous.direct === undefined) delete process.env.DATABASE_DIRECT_URL;
      else process.env.DATABASE_DIRECT_URL = previous.direct;
      for (const result of closers)
        if (result.status === "rejected") errors.push(result.reason);
    }
    if (errors.length)
      throw new AggregateError(errors, "Report fixture cleanup failed");
  });

  const text = (suffix: string) => {
    const file = files.find((file) => file.filename.endsWith(suffix));
    if (!file || typeof file.body !== "string")
      throw new Error(`Missing ${suffix}`);
    return file.body;
  };

  test("generates PDF and CSV files with real timestamp values", () => {
    const pdf = files.find((file) => file.contentType === "application/pdf");
    expect(pdf && Buffer.from(pdf.body).subarray(0, 5).toString()).toBe(
      "%PDF-",
    );
    expect(text("-all-messages.csv")).toContain("2026-10-09T12:01:00.000Z");
    expect(
      text("-all-messages.csv").split("\r\n").filter(Boolean),
    ).toHaveLength(7);
  });

  test("embeds fallback fonts used for visible Chinese, Cyrillic and emoji replies", () => {
    const pdf = files.find((file) => file.contentType === "application/pdf");
    if (!pdf) throw new Error("PDF missing");
    const bytes = Buffer.from(pdf.body).toString("latin1");
    expect(bytes).toContain("Unifont");
    expect(bytes).toContain("UnifontUpper");
  });

  test("includes staff replies and preserves their exact text counts", () => {
    expect(text("-all-messages.csv")).toContain("staff,");
    expect(text("-report.md")).toContain("| Thank you for your reply. | 2 |");
    expect(text("-report.md")).toContain("**Staff reply**");
    expect(text("-report.md")).toContain("สวัสดี — café “Yes” 你好 Привет 🙂");
  });

  test("excludes other number, earlier, later campaign and foreign replies separately", () => {
    const csv = text("-all-messages.csv");
    for (const excluded of [
      "BEFORE SEND",
      "WRONG NUMBER",
      "FOREIGN WORKSPACE",
      "TEST BLAST",
      "LATER CAMPAIGN REPLY",
      "LATER STAFF REPLY",
      "UNSENT NEXT",
    ]) {
      expect(csv).not.toContain(excluded);
    }
  });

  test("shows actual send time when queued records were created earlier", () => {
    expect(text("-report.md")).toContain("2026-10-09, 08:00");
    expect(text("-report.md")).not.toContain("2026-10-09, 06:00");
  });

  test("keeps STOP-only threads in their own appendix", () => {
    const markdown = text("-report.md");
    expect(markdown).toContain("Appendix A — Conversations (1)");
    expect(markdown).toContain("Appendix B — Opt-out threads (1)");
    expect(text("-opt-outs.csv")).toContain("STOP");
    expect(text("-opt-outs.csv")).not.toContain("Thank you");
  });

  test("uses checked-in error descriptions and retains unknown codes", async () => {
    expect(text("-all-messages.csv")).toContain(
      "30006,Landline or unreachable carrier",
    );
    await client`update message set error_code=39999 where campaign_id=${campaign} and "to"=${stopRecipient}`;
    const updated = await report.buildCampaignSmsReport(workspace, campaign);
    expect(
      updated.find((file) => file.filename.endsWith("-all-messages.csv"))?.body,
    ).toContain("39999,Unknown (39999)");
  });

  test("rejects test campaigns and foreign campaign IDs", async () => {
    await expect(
      report.buildCampaignSmsReport(workspace, nextCampaign),
    ).rejects.toThrow("Test campaigns");
    await expect(
      report.buildCampaignSmsReport(foreign, campaign),
    ).rejects.toThrow("Campaign not found");
  });
});
