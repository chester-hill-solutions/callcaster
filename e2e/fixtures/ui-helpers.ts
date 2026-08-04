import type { Page } from "@playwright/test";

type CreationCampaignType = "live_call" | "message" | "robocall";

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
  type: CreationCampaignType,
): Promise<void> {
  let goal: "live_calling" | "text_campaign" | "automated_phone_menu";
  switch (type) {
    case "live_call":
      goal = "live_calling";
      break;
    case "message":
      goal = "text_campaign";
      break;
    case "robocall":
      goal = "automated_phone_menu";
      break;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
  await page.getByTestId(`campaign-goal-${goal}`).check();
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
