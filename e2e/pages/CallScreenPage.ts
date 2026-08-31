import type { Page } from "@playwright/test";
import { enableTwilioMocks } from "../fixtures/twilio-mocks";

export class CallScreenPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(workspaceId: string, campaignId: number | string): Promise<void> {
    await enableTwilioMocks(this.page);
    await this.page.goto(`/workspaces/${workspaceId}/campaigns/${campaignId}/call`);
    await this.dismissBlockingDialogs();
  }

  async dismissBlockingDialogs(): Promise<void> {
    const creditsDialog = this.page.getByRole("dialog").filter({
      hasText: /No Credits Remaining|Campaign Disabled/i,
    });
    if (await creditsDialog.isVisible().catch(() => false)) {
      return;
    }
    // Never press Escape on the inactive-campaign dialog: its onOpenChange
    // navigates (history back), which on a fresh Playwright page lands on
    // about:blank and fails every later locator — the actual #1435 flake.
    // The dialog is an overlay and doesn't block visibility assertions, and
    // the seeded schedules are always-open now anyway.
    const getStarted = this.page.getByRole("button", { name: "Get started" });
    if (await getStarted.isVisible().catch(() => false)) {
      await getStarted.click();
    }
  }

  dialButton() {
    return this.page.getByTestId("call-screen-dial");
  }

  dispositionForm() {
    return this.page.getByTestId("call-screen-disposition");
  }
}
