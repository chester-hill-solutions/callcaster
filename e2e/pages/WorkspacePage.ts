import type { Page } from "@playwright/test";

export class WorkspacePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(workspaceId: string, suffix = ""): Promise<void> {
    const path = suffix
      ? `/workspaces/${workspaceId}/${suffix.replace(/^\//, "")}`
      : `/workspaces/${workspaceId}`;
    await this.page.goto(path);
  }

  navLink(name: string) {
    return this.page.getByRole("link", { name, exact: false });
  }

  async expectNavVisible(name: string): Promise<void> {
    await this.navLink(name).first().waitFor({ state: "visible" });
  }

  async expectNavHidden(name: string): Promise<void> {
    await this.page.getByRole("link", { name, exact: false }).first().waitFor({ state: "hidden" });
  }
}
