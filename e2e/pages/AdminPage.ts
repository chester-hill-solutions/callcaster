import type { Page } from "@playwright/test";

export class AdminPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(path = "/admin"): Promise<void> {
    await this.page.goto(path);
  }
}
