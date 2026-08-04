import { ownerTest, expect } from "../fixtures/test-base";
import { appendWorkspaceEvent } from "../fixtures/factories";
import { E2E_WORKSPACES, workspacePath } from "../fixtures/seed";

/**
 * Does realtime actually deliver to a browser?
 *
 * Nothing established that it did. RT-01 is named "realtime" but calls
 * page.reload() inside its poll, so it only proves a reload shows fresh data —
 * and the mutation it makes (setWorkspaceCredits) writes straight to the
 * database without emitting any event, so no SSE frame could ever have carried
 * it. Meanwhile the workspace_events table did not exist on dev at all, and
 * insertWorkspaceEvent is deliberately best-effort, so the whole path failed
 * silently for months while this suite stayed green.
 *
 * These tests use the transport directly: a real EventSource in a real browser,
 * against the real authenticated endpoint. They deliberately never reload — and
 * assert that, so a future reload-based "fix" cannot make them pass.
 */
ownerTest.describe("Realtime SSE transport @realtime", () => {
  const workspaceId = E2E_WORKSPACES.ready.id;

  /** Open an EventSource in the page and collect frames onto `window`. */
  async function subscribe(page: import("@playwright/test").Page) {
    await page.evaluate((wsId) => {
      const w = window as unknown as {
        __sse: { events: unknown[]; open: boolean };
        __pageLoadToken: number;
      };
      // Reset by a reload; asserted below so a reload cannot fake a pass.
      w.__pageLoadToken = w.__pageLoadToken ?? Date.now();
      w.__sse = { events: [], open: false };
      const source = new EventSource(`/api/workspaces/${wsId}/events`);
      source.addEventListener("open", () => {
        w.__sse.open = true;
      });
      source.addEventListener("workspace_event", (message) => {
        w.__sse.events.push(JSON.parse((message as MessageEvent<string>).data));
      });
    }, workspaceId);

    await expect
      .poll(() => page.evaluate(() => (window as any).__sse.open), { timeout: 20_000 })
      .toBe(true);
  }

  const received = (page: import("@playwright/test").Page) =>
    page.evaluate(() => (window as any).__sse.events as Array<{ id: number; payload: any }>);

  ownerTest("RT-02 an event emitted after connect reaches the browser", async ({ page }) => {
    await page.goto(workspacePath(workspaceId, "campaigns"));
    const token = await page.evaluate(() => {
      (window as any).__pageLoadToken = Date.now();
      return (window as any).__pageLoadToken;
    });

    await subscribe(page);

    const marker = `rt-02-${Date.now()}`;
    const eventId = await appendWorkspaceEvent(workspaceId, {
      table: "campaign_queue",
      eventType: "UPDATE",
      marker,
    });

    await expect
      .poll(async () => (await received(page)).some((e) => e.payload?.marker === marker), {
        timeout: 30_000,
        message: "SSE frame for the appended event never arrived in the browser",
      })
      .toBe(true);

    const delivered = (await received(page)).find((e) => e.payload?.marker === marker);
    expect(delivered?.id).toBe(eventId);

    // No reload happened, so delivery was genuinely push-based.
    expect(await page.evaluate(() => (window as any).__pageLoadToken)).toBe(token);
  });

  /**
   * Regression: a fresh connection used to start at cursor 0 and replay the
   * workspace's entire history, re-applying stale row changes over state the
   * loaders had just built.
   */
  ownerTest("RT-03 a fresh connection does not replay history", async ({ page }) => {
    const staleMarker = `rt-03-stale-${Date.now()}`;
    await appendWorkspaceEvent(workspaceId, {
      table: "campaign_queue",
      eventType: "UPDATE",
      marker: staleMarker,
    });

    await page.goto(workspacePath(workspaceId, "campaigns"));
    await subscribe(page);

    // Prove the stream is live before concluding anything about the backlog:
    // otherwise "no stale event" would also pass on a stream that delivers
    // nothing at all.
    const freshMarker = `rt-03-fresh-${Date.now()}`;
    await appendWorkspaceEvent(workspaceId, {
      table: "campaign_queue",
      eventType: "UPDATE",
      marker: freshMarker,
    });

    await expect
      .poll(async () => (await received(page)).some((e) => e.payload?.marker === freshMarker), {
        timeout: 30_000,
      })
      .toBe(true);

    const markers = (await received(page)).map((e) => e.payload?.marker);
    expect(markers).not.toContain(staleMarker);
  });
});
