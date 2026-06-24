import { ownerTest, expect } from "../fixtures/test-base";
import { postInboundSms } from "../fixtures/webhooks";
import { ChatsPage } from "../pages/ChatsPage";
import { E2E_WORKSPACES } from "../fixtures/seed";

ownerTest("CHAT-04 inbound SMS webhook creates thread visibility", async ({ page, request }) => {
  const from = "+15555501999";
  const body = `E2E inbound ${Date.now()}`;
  const response = await postInboundSms(request, {
    from,
    to: "+15555501001",
    body,
  });
  expect(response.status()).toBeGreaterThanOrEqual(200);
  expect(response.status()).toBeLessThan(300);

  const chats = new ChatsPage(page);
  await chats.goto(E2E_WORKSPACES.ready.id);
  await expect(page.getByText(from).first()).toBeVisible({ timeout: 15_000 });
});
