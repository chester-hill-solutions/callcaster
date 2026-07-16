import { ownerTest, callerTest, expect } from "../fixtures/test-base";
import { CampaignSettingsPage } from "../pages/CampaignSettingsPage";
import { WorkspacePage } from "../pages/WorkspacePage";
import {
  E2E_CAMPAIGNS,
  E2E_SURVEY,
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
    await ws.goto(E2E_WORKSPACES.empty.id, "campaigns");
    await expect(page.getByText(/Get started|Add Campaign|Get a Number/i).first()).toBeVisible();
  });

  ownerTest("ERR-10 chats empty copy", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.empty.id, "chats"));
    await expect(page.getByText(/no conversations yet/i)).toBeVisible();
  });

  ownerTest("ERR-11 audios empty copy", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.empty.id, "audios"));
    await expect(page.getByText("Add Your Own Audio to this Workspace!")).toBeVisible();
  });

  // Regression: the campaign hub streamed `results` as a deferred promise. For a
  // real browser the shell flushed with the fallback and the turbo-stream was
  // never closed, so the client's decoded promise could never settle — React
  // #419, then "Loading results..." forever. Bots were unaffected (entry.server
  // awaits body.allReady for them), and a never-settling promise never rejects,
  // so <Await errorElement> never fired either. Only a browser catches this:
  // asserting the stream closes, or asserting SSR output, both pass while the
  // page stays broken. So this waits out hydration and checks what a user sees.
  ownerTest("ERR-12 campaign hub renders after hydration", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    await page.goto(
      workspacePath(E2E_WORKSPACES.ready.id, `campaigns/${E2E_CAMPAIGNS.liveCall.id}`),
    );

    await expect(page.getByText("Your Campaign Results Will Show Here")).toBeVisible();
    await expect(page.getByText("Loading results...")).toHaveCount(0);

    // #419 = "the server did not finish this Suspense boundary".
    expect(pageErrors.filter((e) => e.includes("419")), pageErrors.join("\n")).toEqual([]);
  });

  // Regression: the survey detail page built its public link from
  // `window.location.origin` during render, so SSR died outright
  // (ReferenceError: window is not defined -> 500) and every survey link on the
  // surveys list was a dead end. Its /edit and /responses children were fine,
  // which is what hid it: the useOutlet() early-return fires before the
  // `window` read, so only the bare detail page ever crashed.
  ownerTest("ERR-13 survey detail page renders (no window during SSR)", async ({ page }) => {
    const res = await page.goto(
      workspacePath(E2E_WORKSPACES.ready.id, `surveys/${E2E_SURVEY.publicId}`),
    );
    expect(res?.status(), "survey detail status").toBe(200);
    await expect(page.getByRole("heading", { name: "E2E Public Survey" })).toBeVisible();
  });
});

callerTest("ERR-07 caller empty workspace copy", async ({ page }) => {
  await page.goto(workspacePath(E2E_WORKSPACES.empty.id, "campaigns"));
  await expect(page.getByText(/contact your admin team/i)).toBeVisible();
});
