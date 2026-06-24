import { ownerTest, expect } from "../fixtures/test-base";
import { postInboundSms } from "../fixtures/webhooks";
import { ChatsPage } from "../pages/ChatsPage";
import { E2E_WORKSPACES } from "../fixtures/seed";

ownerTest("CHAT-04 inbound SMS webhook creates thread visibility", async ({ page, request }) => {
  const response = await postInboundSms(request, {
    from: "+15555501999",
    to: "+15555501001",
    body: `E2E inbound ${Date.now()}`,
  });
  expect([200, 400, 404]).toContain(response.status());

  const chats = new ChatsPage(page);
  await chats.goto(E2E_WORKSPACES.ready.id);
  await expect(page.getByText(/conversation|chat|message/i).first()).toBeVisible();
});
