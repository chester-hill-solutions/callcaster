import { expect, type Page, type TestInfo } from "@playwright/test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { assertTaskRequirement, type SimSmsTaskInput, type SimTaskContext, simTaskDefinitions } from "../task-context";

function csvEscape(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function createContactCsv(testInfo: TestInfo, contact: SimSmsTaskInput["recipient"]): Promise<string> {
  const [firstname, ...surnameParts] = contact.name.split(/\s+/);
  const tempDir = await mkdtemp(join(tmpdir(), "callcaster-sim-contact-"));
  const filePath = join(tempDir, "sim-contact.csv");
  const content = [
    "First name,Last name,Phone number,External ID",
    [firstname, surnameParts.join(" "), contact.phone, "sim-sms-recipient"]
      .map(csvEscape)
      .join(","),
  ].join("\n");
  try {
    await chmod(tempDir, 0o700);
    await writeFile(filePath, content, { encoding: "utf8", mode: 0o600 });
    await chmod(filePath, 0o600);
    await testInfo.attach("sim-contact-evidence.txt", {
      body: ["recordCount: 1", `phoneLast4: ${contact.phone.slice(-4)}`, "recipient: approved-sim-recipient"].join("\n"),
      contentType: "text/plain; charset=utf-8",
    });
    return filePath;
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

export async function uploadSimContactList(args: {
  page: Page;
  testInfo: TestInfo;
  context: SimTaskContext;
  input: Pick<SimSmsTaskInput, "recipient">;
}): Promise<void> {
  const { page, testInfo, context, input } = args;
  assertTaskRequirement(context, simTaskDefinitions.contactList.requires);
  let csvPath: string | undefined;
  try {
    csvPath = await createContactCsv(testInfo, input.recipient);
    const listName = `SIM SMS ${testInfo.testId}`;

    await page.goto(`/workspaces/${context.workspaceId}/audiences/new`);
    await page.getByLabel("Call list name").fill(listName);
    await page.getByTestId("audience-next-upload").click();
    await page.locator('input[name="contacts"]').setInputFiles(csvPath);
    await expect(page.getByRole("heading", { name: "Map CSV Headers" })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Start Upload" }).click();
    await expect(page.getByText("Upload completed successfully!")).toBeVisible();
  } finally {
    if (csvPath) {
      await rm(csvPath, { force: true });
      await rm(dirname(csvPath), { recursive: true, force: true });
    }
  }
}
