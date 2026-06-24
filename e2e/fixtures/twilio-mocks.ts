import type { Page, Route } from "@playwright/test";

export type TwilioMockOptions = {
  failToken?: boolean;
  trackDialRequests?: boolean;
};

export class TwilioMocks {
  dialRequests: unknown[] = [];
  options: TwilioMockOptions;

  constructor(options: TwilioMockOptions = {}) {
    this.options = options;
  }

  async install(page: Page): Promise<void> {
    await page.addInitScript(() => {
      class FakeCall {
        parameters = {};
        on() {
          return this;
        }
        disconnect() {}
      }

      class FakeDevice {
        state = "unregistered";
        constructor(_token: string, _options?: unknown) {}
        on(event: string, handler: (...args: unknown[]) => void) {
          if (event === "registered") {
            queueMicrotask(() => {
              this.state = "registered";
              handler();
            });
          }
          return this;
        }
        register() {
          this.state = "registered";
          return Promise.resolve();
        }
        connect() {
          return Promise.resolve(new FakeCall());
        }
        destroy() {}
      }

      (window as unknown as { Twilio?: { Device: typeof FakeDevice } }).Twilio = {
        Device: FakeDevice,
      };
    });

    const handler = async (route: Route) => {
      const url = route.request().url();
      const path = new URL(url).pathname;

      if (path.includes("/api/token") || path.includes("/api/handset-token")) {
        if (this.options.failToken) {
          await route.fulfill({ status: 500, body: "token error" });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ token: "e2e-fake-jwt-token" }),
        });
        return;
      }

      if (
        path.includes("/api/dial") ||
        path.includes("/api/call") ||
        path.includes("/api/auto-dial") ||
        path.includes("/api/hangup") ||
        path.includes("/api/disconnect") ||
        path.includes("/api/connect-campaign-conference")
      ) {
        const body = route.request().postDataJSON?.() ?? {};
        if (this.options.trackDialRequests) {
          this.dialRequests.push(body);
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, callSid: "CA_e2e_mock_call" }),
        });
        return;
      }

      if (path.includes("/api/sms") || path.includes("/api/chat_sms")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ sid: "SM_e2e_mock_message", success: true }),
        });
        return;
      }

      if (path.includes("/api/initiate-ivr")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ callSid: "CA_e2e_ivr_call", success: true }),
        });
        return;
      }

      await route.continue();
    };

    await page.route("**/api/**", handler);
  }
}

export async function enableTwilioMocks(page: Page, options?: TwilioMockOptions): Promise<TwilioMocks> {
  const mocks = new TwilioMocks(options);
  await mocks.install(page);
  return mocks;
}
