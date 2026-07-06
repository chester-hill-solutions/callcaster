import type { Page } from "@playwright/test";

/** Radix Select exposes a combobox button, not a native <select>. */
export async function selectRadixOption(
  page: Page,
  triggerSelector: string,
  optionLabel: string | RegExp,
): Promise<void> {
  // Prefer the visible trigger (button/combobox) when ids are duplicated with hidden inputs.
  const trigger = page.locator(`${triggerSelector}[role="combobox"], button${triggerSelector}`).first();
  await trigger.click();
  await page.getByRole("option", { name: optionLabel }).click();
}

/** Controlled React inputs sometimes miss Playwright fill(); dispatch input events directly. */
export async function fillControlledInput(
  page: Page,
  selector: string,
  value: string,
): Promise<void> {
  await page.locator(selector).evaluate((el, val) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, val);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}
