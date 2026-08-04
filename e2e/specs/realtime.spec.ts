import { ownerTest, expect } from "../fixtures/test-base";
import { setWorkspaceCredits } from "../fixtures/factories";
import { E2E_WORKSPACES, workspacePath } from "../fixtures/seed";

/**
 * Despite the name this does NOT test realtime: it reloads the page inside the
 * poll, and setWorkspaceCredits writes straight to the database without
 * emitting a workspace event, so no SSE frame could ever carry the change. It
 * is a useful check that the billing page reflects a credit change on reload —
 * just not of the transport. Actual SSE delivery is covered by
 * realtime-sse.spec.ts (RT-02/RT-03).
 */
ownerTest.describe("Billing page refresh @slow", () => {
  ownerTest("RT-01 credits badge reflects a credit change after reload", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "billing"));
    await expect(page.getByText("500").first()).toBeVisible();
    await setWorkspaceCredits(E2E_WORKSPACES.ready.id, 777);
    await expect
      .poll(async () => {
        await page.reload();
        return page.getByText("777").count();
      }, { timeout: 20_000 })
      .toBeGreaterThan(0);
    await setWorkspaceCredits(E2E_WORKSPACES.ready.id, 500);
  });
});
