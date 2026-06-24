import type { Page } from "@playwright/test";

export class BillingPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(workspaceId: string, query = ""): Promise<void> {
    await this.page.goto(`/workspaces/${workspaceId}/billing${query}`);
  }
}
