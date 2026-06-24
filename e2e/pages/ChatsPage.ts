import type { Page } from "@playwright/test";

export class ChatsPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(workspaceId: string, contactPhone?: string): Promise<void> {
    const suffix = contactPhone ? `/chats/${encodeURIComponent(contactPhone)}` : "/chats";
    await this.page.goto(`/workspaces/${workspaceId}${suffix}`);
  }
}
