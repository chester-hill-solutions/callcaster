import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-events.server")>()),
  emitCampaignStatusEvent: vi.fn(async () => undefined),
}));

const DATABASE_URL = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = DATABASE_URL ? describe : describe.skip;

const WORKSPACE_ID = "11111111-2222-4333-8444-777777777777";
const CAMPAIGN_ID = 1794001;

if (!DATABASE_URL) {
  process.stderr.write(
    "\n!! integration-db skipped: no INTEGRATION_DB_URL / DATABASE_URL set.\n",
  );
}

suite("campaign schedule sync status race against a real database (#1794)", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let sqlClient: any;
  let updateCampaignStatusInWorkspace: any;
  let emitCampaignStatusEvent: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  async function cleanup() {
    await sqlClient`delete from campaign where id = ${CAMPAIGN_ID}`;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    const postgres = (await import("postgres")).default;
    sqlClient = postgres(DATABASE_URL as string, { max: 1 });
    ({ updateCampaignStatusInWorkspace } = await import(
      "@/lib/campaign-ivr.server"
    ));
    ({ emitCampaignStatusEvent } = await import(
      "@/lib/workspace-events.server"
    ));
    await sqlClient`
      insert into workspace (id, name, credits)
      values (${WORKSPACE_ID}, 'Schedule Sync Race Integration Workspace', 0)
      on conflict (id) do nothing
    `;
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanup();
    await sqlClient`
      insert into campaign (
        id, created_at, dial_ratio, group_household_queue,
        next_queue_order, title, workspace, status
      ) values (
        ${CAMPAIGN_ID}, ${new Date().toISOString()}, 1, false,
        1, 'Schedule Sync Race Integration Campaign', ${WORKSPACE_ID}, 'running'
      )
    `;
  });

  afterAll(async () => {
    if (!sqlClient) return;
    await cleanup();
    await sqlClient`delete from workspace where id = ${WORKSPACE_ID}`;
    await sqlClient.end();
  });

  test.each(["paused", "complete"])(
    "keeps a concurrent %s after the sweep reads running",
    async (newerStatus) => {
      // This is the schedule sweep's candidate read.
      const [candidate] = await sqlClient`
        select status from campaign where id = ${CAMPAIGN_ID}
      `;
      expect(candidate.status).toBe("running");

      // A user action or completion worker wins before the sweep's UPDATE.
      await sqlClient`
        update campaign set status = ${newerStatus} where id = ${CAMPAIGN_ID}
      `;

      const staleUpdate = await updateCampaignStatusInWorkspace(
        WORKSPACE_ID,
        CAMPAIGN_ID,
        { status: "waiting" },
        { expectedStatus: candidate.status },
      );

      const [persisted] = await sqlClient`
        select status from campaign where id = ${CAMPAIGN_ID}
      `;
      expect(staleUpdate).toBeNull();
      expect(persisted.status).toBe(newerStatus);
      expect(emitCampaignStatusEvent).not.toHaveBeenCalled();
    },
  );
});
