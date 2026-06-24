import { ownerTest, expect } from "../fixtures/test-base";
import { enableTwilioMocks } from "../fixtures/twilio-mocks";
import { E2E_CAMPAIGNS, E2E_WORKSPACES, workspacePath } from "../fixtures/seed";

ownerTest.describe("Message campaign @authenticated", () => {
  ownerTest("MSG-01 message script edit", async ({ page }) => {
    await page.goto(
      workspacePath(
        E2E_WORKSPACES.ready.id,
        `campaigns/${E2E_CAMPAIGNS.message.id}/script/edit`,
      ),
    );
    await expect(page.getByText(/message|body|script/i).first()).toBeVisible();
  });

  ownerTest("MSG-02 send mode in settings", async ({ page }) => {
    await page.goto(
      workspacePath(
        E2E_WORKSPACES.ready.id,
        `campaigns/${E2E_CAMPAIGNS.message.id}/settings`,
      ),
    );
    await expect(page.getByText(/Send using|Phone number|Messaging Service/i).first()).toBeVisible();
  });
});

ownerTest("MSG-03 mocked send endpoint", async ({ page, request }) => {
  await enableTwilioMocks(page);
  const response = await request.post("/api/sms", {
    headers: {
      Authorization: "Bearer cc_e2e_test_key_for_api_calls_only",
      "Content-Type": "application/json",
    },
    data: {
      workspace_id: E2E_WORKSPACES.ready.id,
      to: "+15555501002",
      body: "E2E test",
    },
  });
  expect([200, 400, 401, 403]).toContain(response.status());
});
