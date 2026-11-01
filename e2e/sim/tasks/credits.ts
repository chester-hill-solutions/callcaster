import { expect, type Page } from "@playwright/test";
import { estimateMessageCredits, MIN_CREDITS } from "../../../shared/pricing";
import { assertTaskRequirement, type SimSmsTaskInput, type SimTaskContext, simTaskDefinitions } from "../task-context";

function parseCreditBalance(text: string): number {
  const match = text.match(/([\d,]+) credits/);
  if (!match) throw new Error(`Could not read credit balance from "${text}".`);
  return Number(match[1].replaceAll(",", ""));
}

async function readBalance(page: Page): Promise<number> {
  return parseCreditBalance(
    await page.getByTestId("workspace-credit-balance").innerText(),
  );
}

export function smsCreditsRequired(body: string): number {
  return estimateMessageCredits({ body, hasMedia: false }).credits;
}

export async function ensureSmsCredits(args: {
  page: Page;
  context: SimTaskContext;
  input: Pick<SimSmsTaskInput, "message" | "stripe">;
}): Promise<void> {
  const { page, context, input } = args;
  assertTaskRequirement(context, simTaskDefinitions.credits.requires);
  const required = smsCreditsRequired(input.message);
  await page.goto(`/workspaces/${context.workspaceId}/billing`);
  await expect(page.getByText("Stripe is in test mode")).toBeVisible();
  const balance = await readBalance(page);
  if (balance >= required) return;

  const purchase = Math.max(MIN_CREDITS, required - balance);
  await page.getByPlaceholder("Enter credits").fill(String(purchase));
  await page.getByRole("button", { name: "Purchase Credits" }).click();
  await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  await page.getByLabel("Card number").fill(input.stripe.cardNumber);
  await page.getByLabel(/expiration date/i).fill(input.stripe.expiry);
  await page.getByLabel(/security code/i).fill(input.stripe.cvc);
  await page.getByRole("button", { name: /pay/i }).click();
  await expect(page.getByText("Payment successful")).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => readBalance(page)).toBeGreaterThanOrEqual(required);
}
