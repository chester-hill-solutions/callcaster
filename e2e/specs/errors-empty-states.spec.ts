import { ownerTest, callerTest, expect } from "../fixtures/test-base";
import { CampaignSettingsPage } from "../pages/CampaignSettingsPage";
import { WorkspacePage } from "../pages/WorkspacePage";
import {
  E2E_CAMPAIGNS,
  E2E_WORKSPACES,
  workspacePath,
} from "../fixtures/seed";
import { setCampaignReadinessGap } from "../fixtures/factories";

ownerTest.describe("Errors and empty states @authenticated", () => {
  ownerTest("ERR-01 invalid workspace uuid redirect", async ({ page }) => {
    await page.goto("/workspaces/not-a-valid-uuid");
    await expect(page).toHaveURL(/\/workspaces/);
  });

  ownerTest("ERR-05 readiness queue empty blocks start", async ({ page }) => {
    await setCampaignReadinessGap(E2E_CAMPAIGNS.message.id, "queue_empty");
    const settings = new CampaignSettingsPage(page);
    await settings.goto(E2E_WORKSPACES.ready.id, E2E_CAMPAIGNS.message.id);
    await expect(settings.readinessPanel()).toBeVisible();
    await expect(page.getByText(/contact|queue|add at least one/i).first()).toBeVisible();
  });

  ownerTest("ERR-07 empty workspace owner CTA", async ({ page }) => {
    const ws = new WorkspacePage(page);
    await ws.goto(E2E_WORKSPACES.empty.id);
    await expect(page.getByText(/campaign|create|new/i).first()).toBeVisible();
  });

  ownerTest("ERR-10 chats empty copy", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.empty.id, "chats"));
    await expect(page.getByText(/no conversations yet/i)).toBeVisible();
  });

  ownerTest("ERR-11 audios empty copy", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.empty.id, "audios"));
    await expect(page.getByText(/no audio/i)).toBeVisible();
  });
});

callerTest("ERR-07 caller empty workspace copy", async ({ page }) => {
  await page.goto(workspacePath(E2E_WORKSPACES.empty.id));
  await expect(page.getByText(/contact.*admin|administrator/i)).toBeVisible();
});
