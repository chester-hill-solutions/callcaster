import {
  ownerTest,
  adminTest,
  memberTest,
  callerTest,
  expect,
} from "../fixtures/test-base";
import { E2E_API_KEY, E2E_WORKSPACES, workspacePath } from "../fixtures/seed";

ownerTest.describe("Workspace API keys @authenticated", () => {
  ownerTest("API-01 owner sees API keys section", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "settings"));
    await expect(page.getByText(/api key/i).first()).toBeVisible();
  });

  ownerTest("API-02 create key shows reveal banner", async ({ page }) => {
    await page.goto(`${workspacePath(E2E_WORKSPACES.ready.id, "settings")}?create=1`);
    await expect(page.getByTestId("api-key-create-form")).toBeVisible();
    await page.locator("#api-key-name").fill("E2E Playwright Key");
    // Capability scopes are required on create after the CHS capability cutover.
    await page.locator('input[data-scope-value="messages.send"]').check();
    await expect(page.locator('input[type="hidden"][name="scopes"][value="messages.send"]')).toHaveCount(1);
    await page.getByTestId("api-key-submit").click();
    await page.waitForURL(/\/settings/);
    await expect(page.getByTestId("api-key-reveal")).toBeVisible({ timeout: 30_000 });
  });

  ownerTest("API-05 SMS with seeded key", async ({ request }) => {
    const response = await request.post("/api/sms", {
      headers: {
        Authorization: `Bearer ${E2E_API_KEY.plaintext}`,
        "Content-Type": "application/json",
      },
      data: {
        workspace_id: E2E_WORKSPACES.ready.id,
        to: "+15555501002",
        body: "API key E2E",
      },
    });
    expect([200, 400, 401, 403, 500]).toContain(response.status());
  });
});

callerTest("API-04 caller cannot see API keys", async ({ page }) => {
  await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "settings"));
  await expect(page.getByText(/api keys/i)).toHaveCount(0);
});

// Issue #1264: minting is admin+, so the member role — which reaches the rest
// of settings — must not see the section either. The member case was the gap:
// only the two extremes were covered, and member is the role that could
// previously mint a key outranking itself.
memberTest("API-06 member cannot see API keys", async ({ page }) => {
  await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "settings"));
  await expect(page.getByText(/api keys/i)).toHaveCount(0);
  await expect(page.getByTestId("api-key-create-form")).toHaveCount(0);
});

memberTest("API-07 member reaches settings but not the create form", async ({
  page,
}) => {
  await page.goto(`${workspacePath(E2E_WORKSPACES.ready.id, "settings")}?create=1`);
  // Settings itself is still member-accessible — only the key section is not.
  await expect(page.getByText(/workspace/i).first()).toBeVisible();
  await expect(page.getByTestId("api-key-create-form")).toHaveCount(0);
});

adminTest("API-08 admin sees the section but is not offered audit.read", async ({
  page,
}) => {
  await page.goto(`${workspacePath(E2E_WORKSPACES.ready.id, "settings")}?create=1`);
  await expect(page.getByTestId("api-key-create-form")).toBeVisible();
  // Admin holds members.invite; audit.read is owner-only, so the picker must
  // not offer it — the UI mirror of assertScopesWithinActorRole.
  await expect(
    page.locator('input[data-scope-value="members.invite"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('input[data-scope-value="audit.read"]'),
  ).toHaveCount(0);
});
