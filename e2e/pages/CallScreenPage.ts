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
  }

  dialButton() {
    return this.page.getByTestId("call-screen-dial");
  }

  dispositionForm() {
    return this.page.getByTestId("call-screen-disposition");
  }
}
