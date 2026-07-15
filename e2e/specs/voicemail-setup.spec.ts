import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { adminDb } from "@/server/admin-db";
import { workspace_number } from "@/db/schema";
import { ownerTest, callerTest, expect } from "../fixtures/test-base";
import { E2E_WORKSPACES, workspacePath } from "../fixtures/seed";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GREETING_FIXTURE = path.resolve(__dirname, "../fixtures/files/greeting.mp3");
const BAD_AUDIO_FIXTURE = path.resolve(
  __dirname,
  "../fixtures/files/audience-good.csv",
);

const EMPTY_WORKSPACE_NUMBER_ID = 940002;

/**
 * Uploads reject duplicate names and the stored object outlives the DB reset,
 * so each run gets fresh names rather than trying to clean MinIO from here —
 * the test process has no S3 credentials, only the server does.
 */
const RUN_ID = Date.now().toString(36);
const uploadName = (suffix: string) => `e2e-vm-${RUN_ID}-${suffix}`;

async function clearRouting(): Promise<void> {
  await adminDb
    .update(workspace_number)
    .set({ inbound_audio: null, inbound_action: null })
    .where(eq(workspace_number.id, EMPTY_WORKSPACE_NUMBER_ID));
}

async function readGreeting(): Promise<string | null> {
  const [row] = await adminDb
    .select({ inbound_audio: workspace_number.inbound_audio })
    .from(workspace_number)
    .where(eq(workspace_number.id, EMPTY_WORKSPACE_NUMBER_ID));
  return row?.inbound_audio ?? null;
}

/**
 * The greeting is only live when `inbound_action` also holds an email —
 * otherwise `api/inbound` falls through to say-and-hangup and no voicemail is
 * ever recorded. Assert both columns so a passing test means working voicemail.
 */
async function readRouting(): Promise<string | null> {
  const [row] = await adminDb
    .select({ inbound_action: workspace_number.inbound_action })
    .from(workspace_number)
    .where(eq(workspace_number.id, EMPTY_WORKSPACE_NUMBER_ID));
  return row?.inbound_action ?? null;
}

ownerTest.describe("Voicemail setup @authenticated", () => {
  ownerTest.beforeEach(async () => {
    await clearRouting();
  });

  ownerTest("VM-01 empty state offers a working setup path", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.empty.id, "voicemails"));

    await expect(page.getByText(/No voicemails yet/i)).toBeVisible();

    await page.getByRole("link", { name: /Set up voicemail/i }).click();

    await expect(page).toHaveURL(/\/voicemails\/setup$/);
    await expect(
      page.getByRole("heading", { name: /Set up voicemail/i }),
    ).toBeVisible();
    await expect(page.getByText(/E2E Empty Workspace Number/i)).toBeVisible();
  });

  ownerTest("VM-02 uploading a greeting makes voicemail live on the number", async ({
    page,
  }) => {
    const name = uploadName("assign");
    await page.goto(workspacePath(E2E_WORKSPACES.empty.id, "voicemails/setup"));

    await page.getByRole("radio", { name: /Upload a new greeting/i }).check();
    await page.getByLabel(/Greeting name/i).fill(name);
    await page.setInputFiles("#media", GREETING_FIXTURE);
    await page.getByRole("checkbox", { name: /E2E Empty Workspace Number/i }).check();
    await page
      .getByLabel(/Who should get the voicemails/i)
      .selectOption("owner@e2e.test");

    await page.getByRole("button", { name: /Save voicemail setup/i }).click();

    await expect(page).toHaveURL(/\/voicemails\?configured=1$/);
    await expect(page.getByText(/Voicemail is set up/i)).toBeVisible();

    await expect.poll(readGreeting).toBe(`${name}.mp3`);
    // Without this, the greeting saves but callers still hit say-and-hangup.
    await expect.poll(readRouting).toBe("owner@e2e.test");
  });

  ownerTest("VM-03 setup refuses to save with no number selected", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.empty.id, "voicemails/setup"));

    await page
      .getByRole("checkbox", { name: /E2E Empty Workspace Number/i })
      .uncheck();
    await page.getByRole("button", { name: /Save voicemail setup/i }).click();

    await expect(page.getByText(/Choose at least one phone number/i)).toBeVisible();
    expect(await readGreeting()).toBeNull();
  });

  ownerTest("VM-05 a rejected file explains itself without leaking internals", async ({
    page,
  }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.empty.id, "voicemails/setup"));

    await page.getByRole("radio", { name: /Upload a new greeting/i }).check();
    await page.getByLabel(/Greeting name/i).fill(uploadName("bad"));
    await page.setInputFiles("#media", BAD_AUDIO_FIXTURE);
    await page.getByRole("checkbox", { name: /E2E Empty Workspace Number/i }).check();
    await page
      .getByLabel(/Who should get the voicemails/i)
      .selectOption("owner@e2e.test");

    await page.getByRole("button", { name: /Save voicemail setup/i }).click();

    const alert = page.getByRole("alert").first();
    await expect(alert).toBeVisible();
    // ffmpeg's raw output must never reach the user.
    await expect(alert).not.toContainText(/mp3 @ 0x|MPEG audio frames|pipe:0/i);
    expect(await readRouting()).toBeNull();
  });

  ownerTest("VM-06 setup refuses to save without a voicemail recipient", async ({
    page,
  }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.empty.id, "voicemails/setup"));

    await page.getByRole("radio", { name: /Upload a new greeting/i }).check();
    await page.getByLabel(/Greeting name/i).fill(uploadName("norecipient"));
    await page.setInputFiles("#media", GREETING_FIXTURE);
    await page.getByRole("checkbox", { name: /E2E Empty Workspace Number/i }).check();
    await page.getByLabel(/Who should get the voicemails/i).selectOption("");

    await page.getByRole("button", { name: /Save voicemail setup/i }).click();

    await expect(page.getByText(/Choose who should receive/i)).toBeVisible();
    expect(await readRouting()).toBeNull();
  });

  ownerTest("VM-07 a duplicate greeting name explains itself without leaking the storage path", async ({
    page,
  }) => {
    const name = uploadName("dupe");
    const submit = async () => {
      await page.goto(workspacePath(E2E_WORKSPACES.empty.id, "voicemails/setup"));
      await page.getByRole("radio", { name: /Upload a new greeting/i }).check();
      await page.getByLabel(/Greeting name/i).fill(name);
      await page.setInputFiles("#media", GREETING_FIXTURE);
      await page
        .getByRole("checkbox", { name: /E2E Empty Workspace Number/i })
        .check();
      await page
        .getByLabel(/Who should get the voicemails/i)
        .selectOption("owner@e2e.test");
      await page.getByRole("button", { name: /Save voicemail setup/i }).click();
    };

    await submit();
    await expect(page).toHaveURL(/\/voicemails\?configured=1$/);

    await submit();
    const alert = page.getByRole("alert").first();
    await expect(alert).toContainText(/already exists/i);
    // The workspace id and object key must not surface.
    await expect(alert).not.toContainText(E2E_WORKSPACES.empty.id);
  });
});

callerTest.describe("Voicemail setup permissions @authenticated", () => {
  callerTest("VM-04 callers cannot reach voicemail setup", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.empty.id, "voicemails/setup"));

    await expect(page).not.toHaveURL(/\/voicemails\/setup$/);
    await expect(
      page.getByRole("heading", { name: /Set up voicemail/i }),
    ).toHaveCount(0);
  });
});
