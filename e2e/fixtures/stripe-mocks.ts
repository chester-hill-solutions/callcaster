import type { Page } from "@playwright/test";

export type StripeMockSession = {
  sessionId: string;
  workspaceId: string;
  creditAmount: number;
};

export async function installStripeCheckoutMock(
  page: Page,
  session: StripeMockSession,
): Promise<void> {
  await page.route("**/workspaces/*/billing", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    const checkoutUrl = `/e2e/stripe-checkout?session_id=${encodeURIComponent(session.sessionId)}`;
    await route.fulfill({
      status: 302,
      headers: { Location: checkoutUrl },
    });
  });
}

export async function mockStripeSessionRetrieve(session: StripeMockSession): Promise<void> {
  process.env.E2E_STRIPE_SESSION = JSON.stringify({
    status: "complete",
    metadata: {
      workspaceId: session.workspaceId,
      creditAmount: String(session.creditAmount),
    },
  });
}
