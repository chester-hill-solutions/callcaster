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
