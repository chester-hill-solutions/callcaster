import { test, expect } from "@playwright/test";
import { SurveyPublicPage } from "../pages/SurveyPublicPage";
import { E2E_CONTACTS, E2E_SURVEY } from "../fixtures/seed";

test.describe("Public survey @smoke", () => {
  test("SURV-01 anonymous visit", async ({ page }) => {
    const survey = new SurveyPublicPage(page);
    await survey.goto(E2E_SURVEY.publicId);
    await expect(page.getByText(/E2E Public Survey|How are you/i).first()).toBeVisible();
  });

  test("SURV-02 known contact param loads survey", async ({ page }) => {
    const survey = new SurveyPublicPage(page);
    await survey.goto(E2E_SURVEY.publicId, E2E_CONTACTS.primary.id);
    await expect(page).toHaveURL(new RegExp(`contact=${E2E_CONTACTS.primary.id}`));
    await expect(page.getByText("E2E Public Survey")).toBeVisible();
  });

  test("SURV-08 invalid survey 404", async ({ page }) => {
    const response = await page.goto("/survey/not-a-real-survey-id");
    expect(response?.status()).toBe(404);
  });
});
