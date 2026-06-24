import type { Page } from "@playwright/test";
import { E2E_PASSWORD } from "../fixtures/seed";

export class SignInPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(next?: string): Promise<void> {
    await this.page.goto(next ? `/signin?next=${encodeURIComponent(next)}` : "/signin");
  }

  async login(email: string, password = E2E_PASSWORD): Promise<void> {
    await this.page.locator("#email").fill(email);
    await this.page.locator("#password").fill(password);
    await this.page.getByRole("button", { name: "Login" }).click();
  }

  async expectError(): Promise<void> {
    await this.page.getByText(/invalid|error/i).first().waitFor();
  }
}
