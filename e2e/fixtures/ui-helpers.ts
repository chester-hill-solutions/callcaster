import type { Page } from "@playwright/test";

const CAMPAIGN_TYPE_OFFSET: Record<string, number> = {
  live_call: 0,
  message: 1,
  robocall: 2,
};

/** Radix Select exposes a combobox button, not a native <select>. */
export async function selectRadixOption(
  page: Page,
  triggerSelector: string,
  optionLabel: string | RegExp,
): Promise<void> {
  const trigger = page
    .locator(`button${triggerSelector}, [data-testid="${triggerSelector.replace("#", "")}"]`)
    .first();
  await trigger.click();
  const option = page.getByRole("option", { name: optionLabel });
  if (await option.isVisible().catch(() => false)) {
    await option.click();
    return;
  }
  await page.keyboard.press("ArrowDown");
  await page.getByRole("option", { name: optionLabel }).click();
}

export async function selectCampaignType(
  page: Page,
  type: keyof typeof CAMPAIGN_TYPE_OFFSET,
): Promise<void> {
  if (type === "live_call") return;
  await page.locator('[data-testid="campaign-type"]').click();
  for (let i = 0; i < CAMPAIGN_TYPE_OFFSET[type]; i += 1) {
    await page.keyboard.press("ArrowDown");
  }
  await page.keyboard.press("Enter");
}

/** Controlled React inputs sometimes miss Playwright fill(); set native value + events. */
export async function fillControlledInput(
  page: Page,
  selector: string,
  value: string,
): Promise<void> {
  const input = page.locator(selector);
  await input.click();
  await input.evaluate((el, nextValue) => {
    const node = el as HTMLInputElement;
    const descriptor = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    );
    descriptor?.set?.call(node, nextValue);
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}
