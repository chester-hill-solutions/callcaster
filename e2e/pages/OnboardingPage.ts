import type { Page } from "@playwright/test";

export class OnboardingPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(workspaceId: string, step?: string): Promise<void> {
    const query = step ? `?step=${step}` : "";
    await this.page.goto(`/workspaces/${workspaceId}/onboarding${query}`);
  }

  stepIndicator() {
    return this.page.getByTestId("onboarding-step");
  }
}
