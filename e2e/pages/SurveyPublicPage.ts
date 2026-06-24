import type { Page } from "@playwright/test";

export class SurveyPublicPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(publicSurveyId: string, contactId?: number): Promise<void> {
    const query = contactId ? `?contact=${contactId}` : "";
    await this.page.goto(`/survey/${publicSurveyId}${query}`);
  }
}
