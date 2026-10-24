import { expect, type Page, type TestInfo } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assertTaskRequirement, type SimSmsTaskInput, type SimTaskContext, simTaskDefinitions } from "../task-context";

function csvEscape(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function createContactCsv(testInfo: TestInfo, contact: SimSmsTaskInput["recipient"]): Promise<string> {
  const [firstname, ...surnameParts] = contact.name.split(/\s+/);
  const filePath = join(testInfo.outputDir, "sim-contact.csv");
  const content = [
    "First name,Last name,Phone number,External ID",
    [firstname, surnameParts.join(" "), contact.phone, "sim-sms-recipient"]
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
  context: SimTaskContext;
  input: Pick<SimSmsTaskInput, "recipient">;
}): Promise<void> {
  const { page, testInfo, context, input } = args;
  assertTaskRequirement(context, simTaskDefinitions.contactList.requires);
  const csvPath = await createContactCsv(testInfo, input.recipient);
  const listName = `SIM SMS ${testInfo.testId}`;

  await page.goto(`/workspaces/${context.workspaceId}/audiences/new`);
  await page.getByLabel("Call list name").fill(listName);
  await page.getByTestId("audience-next-upload").click();
  await page.locator('input[name="contacts"]').setInputFiles(csvPath);
  await expect(page.getByRole("heading", { name: "Map CSV Headers" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Start Upload" }).click();
  await expect(page.getByText("Upload completed successfully!")).toBeVisible();
}
