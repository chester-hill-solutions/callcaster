import { expect, type Page, type TestInfo } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

type SimContact = { name: string; phone: string };

function csvEscape(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function createContactCsv(testInfo: TestInfo, contact: SimContact): Promise<string> {
  const [firstname, ...surnameParts] = contact.name.split(/\s+/);
  const filePath = join(testInfo.outputDir, "sim-contact.csv");
  const content = [
    "First name,Last name,Phone number,External ID",
    [firstname, surnameParts.join(" "), contact.phone, "sim-sai-local-saihaan-syed"]
      .map(csvEscape)
      .join(","),
  ].join("\n");
  await mkdir(testInfo.outputDir, { recursive: true });
  await writeFile(filePath, content, "utf8");
  await testInfo.attach("sim-contact.csv", {
    body: content,
    contentType: "text/csv; charset=utf-8",
  });
  return filePath;
}

export async function uploadSimContactList(args: {
  page: Page;
  testInfo: TestInfo;
  workspaceId: string;
  contact: SimContact;
}): Promise<void> {
  const { page, testInfo, workspaceId, contact } = args;
  const csvPath = await createContactCsv(testInfo, contact);
  const listName = `SIM sai-local ${testInfo.testId}`;

  await page.goto(`/workspaces/${workspaceId}/audiences/new`);
  await page.getByLabel("Call list name").fill(listName);
  await page.getByTestId("audience-next-upload").click();
  await page.locator('input[name="contacts"]').setInputFiles(csvPath);
  await expect(page.getByRole("heading", { name: "Map CSV Headers" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Start Upload" }).click();
  await expect(page.getByText("Upload completed successfully!")).toBeVisible();
}
