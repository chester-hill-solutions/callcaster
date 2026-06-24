import { ownerTest, expect } from "../fixtures/test-base";
import { ChatsPage } from "../pages/ChatsPage";
import { E2E_CONTACTS, E2E_WORKSPACES } from "../fixtures/seed";

ownerTest.describe("Chats @authenticated", () => {
  ownerTest("CHAT-01 inbox lists threads", async ({ page }) => {
    const chats = new ChatsPage(page);
    await chats.goto(E2E_WORKSPACES.ready.id);
    await expect(page.getByText(/Contact1|\+15555501002|\+15555501999|\d+ messages/i).first()).toBeVisible();
  });

  ownerTest("CHAT-02 thread view", async ({ page }) => {
    const chats = new ChatsPage(page);
    await chats.goto(E2E_WORKSPACES.ready.id, E2E_CONTACTS.primary.phone);
    await expect(page.getByText(/Chat with Contact1|Contact1 E2E/i).first()).toBeVisible();
  });
});
