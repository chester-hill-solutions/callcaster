import type { Page } from "@playwright/test";

export class CampaignSettingsPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(workspaceId: string, campaignId: number | string): Promise<void> {
    await this.page.goto(`/workspaces/${workspaceId}/campaigns/${campaignId}/settings`);
  }

  readinessPanel() {
    return this.page.getByTestId("campaign-readiness");
  }

  async expectStartDisabled(): Promise<void> {
    const start = this.page.getByRole("button", { name: /start/i }).first();
    await start.waitFor();
    await start.isDisabled();
  }
}
