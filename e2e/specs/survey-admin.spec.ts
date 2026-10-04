import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { ownerTest, expect } from "../fixtures/test-base";
import { E2E_SURVEY, E2E_WORKSPACES, workspacePath } from "../fixtures/seed";

ownerTest.describe("Survey admin @authenticated", () => {
  ownerTest("SURV-10 admin responses list", async ({ page }) => {
    await page.goto(
      workspacePath(E2E_WORKSPACES.ready.id, `surveys/${E2E_SURVEY.publicId}/responses`),
    );
    await expect(page.getByRole("heading", { name: "Survey Responses" })).toBeVisible();
    await expect(page.getByText("E2E Public Survey")).toBeVisible();
  });

  ownerTest(
    "SURV-11 first and repeated exports download current responses",
    async ({ page }) => {
      const responsePath = workspacePath(
        E2E_WORKSPACES.ready.id,
        `surveys/${E2E_SURVEY.publicId}/responses`,
      );
      const exportPath = `${responsePath}/export`;
      const marker = `export-${randomUUID()}`;
      const respondent = await page.context().newPage();
      try {
        await respondent.goto(`/survey/${E2E_SURVEY.publicId}`);
        const comments = respondent.getByLabel("Any comments?", {
          exact: true,
        });
        const savedFirst = respondent.waitForResponse(
          (response) =>
            response.url().endsWith("/api/survey-answer") &&
            response.request().method() === "POST",
        );
        await comments.fill(`${marker}-first`);
        const firstSave = await savedFirst;
        expect(firstSave.status()).toBe(200);
        expect(await firstSave.json()).toMatchObject({ success: true });

        await page.goto(responsePath);
        const originalUrl = page.url();
        const foreignExportPath = workspacePath(
          E2E_WORKSPACES.empty.id,
          `surveys/${E2E_SURVEY.publicId}/responses/export`,
        );
        const denied = await page.request.get(foreignExportPath);
        expect(denied.status()).toBe(404);
        expect(denied.headers()["content-disposition"]).toBeUndefined();
        const response = await page.request.get(exportPath);
        expect(response.status()).toBe(200);
        expect(response.headers()["content-type"]).toContain("text/csv");
        expect(response.headers()["content-disposition"]).toMatch(
          /^attachment; filename="survey-responses-/,
        );
        expect(response.headers()["cache-control"]).toBe("no-store");
        expect(await response.text()).toContain(`${marker}-first`);
        const [download, request] = await Promise.all([
          page.waitForEvent("download", { timeout: 10_000 }),
          page.waitForRequest(
            (request) => new URL(request.url()).pathname === exportPath,
          ),
          page.getByText("Export Data", { exact: true }).click(),
        ]);
        expect(request.method()).toBe("GET");
        const firstPath = await download.path();
        if (!firstPath) throw new Error("First CSV download has no saved file");
        const firstCsv = await readFile(firstPath, "utf8");
        expect(firstCsv).toContain(`${marker}-first`);
        expect(download.suggestedFilename()).toMatch(/\.csv$/);
        expect(page.url()).toBe(originalUrl);

        const savedSecond = respondent.waitForResponse(
          (response) =>
            response.url().endsWith("/api/survey-answer") &&
            response.request().method() === "POST",
        );
        await comments.fill(`${marker}-second`);
        const secondSave = await savedSecond;
        expect(secondSave.status()).toBe(200);
        expect(await secondSave.json()).toMatchObject({ success: true });
        const [latest, secondRequest] = await Promise.all([
          page.waitForEvent("download", { timeout: 10_000 }),
          page.waitForRequest(
            (request) => new URL(request.url()).pathname === exportPath,
          ),
          page.getByText("Export Data", { exact: true }).click(),
        ]);
        expect(secondRequest.method()).toBe("GET");
        const secondPath = await latest.path();
        if (!secondPath)
          throw new Error("Second CSV download has no saved file");
        const secondCsv = await readFile(secondPath, "utf8");
        expect(secondCsv).toContain(`${marker}-second`);
        expect(secondCsv).not.toContain(`${marker}-first`);
        expect(page.url()).toBe(originalUrl);
      } finally {
        await respondent.close();
      }
    },
  );

  ownerTest("SURV-12 surveys list with public link", async ({ page }) => {
    await page.goto(workspacePath(E2E_WORKSPACES.ready.id, "surveys"));
    await expect(page.getByText(/E2E Public Survey|survey/i).first()).toBeVisible();
  });
});
