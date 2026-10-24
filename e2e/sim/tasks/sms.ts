import { expect, type Page } from "@playwright/test";
import { assertTaskRequirement, type SimSmsTaskInput, type SimTaskContext, simTaskDefinitions } from "../task-context";

export async function sendSmsFromChats(args: {
  page: Page;
  context: SimTaskContext;
  input: Pick<SimSmsTaskInput, "recipient" | "message">;
}): Promise<void> {
  const { page, context, input } = args;
  assertTaskRequirement(context, simTaskDefinitions.sms.requires);
  await page.goto(`/workspaces/${context.workspaceId}/chats/${encodeURIComponent(input.recipient.phone)}`);
  const composer = page.getByRole("textbox").last();
  await composer.fill(input.message);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".message-item").filter({ hasText: input.message })).toBeVisible();
}
