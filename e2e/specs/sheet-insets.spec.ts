import type { Locator } from "@playwright/test";
import { ownerTest, expect } from "../fixtures/test-base";
import {
  E2E_CAMPAIGNS,
  E2E_CONTACTS,
  E2E_WORKSPACES,
  workspacePath,
} from "../fixtures/seed";

async function geometry(sheet: Locator) {
  await expect.poll(() => sheet.getAttribute("data-entering")).toBeNull();
  await sheet.evaluate((element) =>
    Promise.all(
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished),
    ),
  );
  return sheet.evaluate((element) => {
    const body = element.querySelector('[data-slot="sheet-body"]');
    const header = element.querySelector('[data-slot="sheet-header"]');
    const footer = element.querySelector('[data-slot="sheet-footer"]');
    if (!body || !header) throw new Error("Missing sheet slots");
    const bounds = element.getBoundingClientRect();
    const inset = (slot: Element) => {
      const rect = slot.getBoundingClientRect();
      const style = getComputedStyle(slot);
      return {
        left: rect.left - bounds.left + parseFloat(style.paddingLeft),
        right: bounds.right - rect.right + parseFloat(style.paddingRight),
      };
    };
    return {
      body: inset(body),
      header: inset(header),
      footer: footer ? inset(footer) : null,
    };
  });
}

for (const width of [390, 1280]) {
  for (const scheme of ["light", "dark"] as const) {
    ownerTest(
      `SHEET-01 audio form has one matching inset at ${width}px in ${scheme}`,
      async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(
          workspacePath(
            E2E_WORKSPACES.ready.id,
            `campaigns/${E2E_CAMPAIGNS.liveCall.id}/settings`,
          ),
        );
        const trigger = page.getByRole("button", {
          name: "Add audio",
          exact: true,
        });
        await expect(trigger).toBeVisible();
        if (scheme === "dark")
          await expect(page.locator("html")).toHaveClass(/dark/);
        else await expect(page.locator("html")).not.toHaveClass(/dark/);
        await page.evaluate(() => document.fonts.ready);
        await trigger.scrollIntoViewIfNeeded();
        const pageHeading = page
          .locator('[aria-label="Campaign setup"]')
          .getByRole("heading", {
            name: "Setup",
            exact: true,
            includeHidden: true,
          });
        const before = await pageHeading.boundingBox();
        await trigger.click();
        const sheet = page.locator('[data-slot="sheet-content"]');
        await expect(
          page.getByRole("heading", { name: "Add audio", exact: true }),
        ).toBeVisible();
        await expect
          .poll(async () => (await geometry(sheet)).body.left)
          .toBeCloseTo(25, 0);
        const measured = await geometry(sheet);
        expect(measured.body.left).toBeCloseTo(measured.header.left, 1);
        expect(measured.body.right).toBeCloseTo(measured.header.right, 1);
        expect(measured.footer?.left).toBeCloseTo(measured.header.left, 1);
        expect(measured.footer?.right).toBeCloseTo(measured.header.right, 1);
        const nameBounds = await page.getByLabel(/audio name/i).boundingBox();
        const buttonBounds = await page
          .getByRole("button", { name: "Upload audio", exact: true })
          .boundingBox();
        if (!nameBounds || !buttonBounds)
          throw new Error("Audio controls have no visible bounds");
        expect(nameBounds.x).toBeCloseTo(buttonBounds.x, 1);
        expect(nameBounds.width).toBeCloseTo(buttonBounds.width, 1);
        expect(await pageHeading.boundingBox()).toEqual(before);
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        await expect(sheet).toHaveCount(0);
        expect(await pageHeading.boundingBox()).toEqual(before);
      },
    );
  }
}

ownerTest(
  "SHEET-02 workspace navigation stays edge to edge",
  async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id));
    await page
      .getByRole("button", { name: "Browse Workspace", exact: true })
      .click();
    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(
      sheet.locator('[data-slot="sheet-body"][data-inset="none"]'),
    ).toBeVisible();
    await expect
      .poll(async () => (await geometry(sheet)).body.left)
      .toBeCloseTo(0, 0);
    expect((await geometry(sheet)).body.right).toBeCloseTo(1, 0);
    await page.getByRole("button", { name: "Close", exact: true }).click();
  },
);

ownerTest(
  "SHEET-03 mobile conversation list stays edge to edge",
  async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(
      workspacePath(
        E2E_WORKSPACES.ready.id,
        `chats/${E2E_CONTACTS.primary.phone}`,
      ),
    );
    await page.getByRole("button", { name: "Chats", exact: true }).click();
    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(
      sheet.locator('[data-slot="sheet-body"][data-inset="none"]'),
    ).toBeVisible();
    await expect
      .poll(async () => (await geometry(sheet)).body.left)
      .toBeCloseTo(0, 0);
    expect((await geometry(sheet)).body.right).toBeCloseTo(1, 0);
    await page.getByRole("button", { name: "Close", exact: true }).click();
  },
);

ownerTest(
  "SHEET-04 site menu retains its compact navigation spacing",
  async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id));
    await page
      .getByRole("button", { name: "Open navigation menu", exact: true })
      .click();
    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(
      sheet.locator('[data-slot="sheet-body"][data-inset="navigation"]'),
    ).toBeVisible();
    await expect
      .poll(async () => (await geometry(sheet)).body.left)
      .toBeCloseTo(13, 0);
    expect((await geometry(sheet)).body.right).toBeCloseTo(12, 0);
  },
);
