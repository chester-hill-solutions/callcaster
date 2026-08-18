import path from "node:path";
import { fileURLToPath } from "node:url";
import { ownerTest, expect } from "../fixtures/test-base";
import { E2E_WORKSPACES, workspacePath } from "../fixtures/seed";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// End-to-end job-pipeline coverage: the wizard enqueues an audience_upload
// job that only the worker process resolves. This spec requires the worker
// started by the compose harness — without it, the upload sits in
// "processing" forever (the exact failure mode of #1078, which shipped
// because nothing exercised job completion).
ownerTest("AUD-05 upload wizard completes end-to-end via the job worker", async ({ page }) => {
  const csvPath = path.join(__dirname, "..", "fixtures", "files", "audience-one-contact.csv");

  await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "audiences/new"));

  // Step 1 has a single forward CTA, gated on a non-empty name (#1060).
  const next = page.getByTestId("audience-next-upload");
  await expect(next).toBeDisabled();
  await page.getByLabel("Call list name").fill("E2E Upload Completion");
  await expect(next).toBeEnabled();
  await next.click();

  await expect(page.getByTestId("audience-upload-step")).toBeVisible();
  await page.locator("#contacts").setInputFiles(csvPath);
  await expect(page.getByText("Map CSV Headers")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: "Start Upload" }).click();

  // Submit → job enqueue → worker claim (≤5s poll) → chunk insert → status
  // flip. 20s leaves headroom over the observed ~6s without masking a hang.
  await expect(page.getByText("Upload completed successfully!")).toBeVisible({ timeout: 20_000 });

  // The finished list is reachable and carries the name it was given.
  await page.getByRole("button", { name: "View Call list" }).click();
  await expect(page.getByRole("heading", { name: "E2E Upload Completion" })).toBeVisible();
});
