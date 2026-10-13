import { expect, type Page } from "@playwright/test";

export async function sendSmsFromChats(args: {
  page: Page;
  workspaceId: string;
  recipientPhone: string;
  message: string;
}): Promise<void> {
  const { page, workspaceId, recipientPhone, message } = args;
  await page.goto(`/workspaces/${workspaceId}/chats/${encodeURIComponent(recipientPhone)}`);
  const composer = page.getByRole("textbox").last();
  await composer.fill(message);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".message-item").filter({ hasText: message })).toBeVisible();
}
