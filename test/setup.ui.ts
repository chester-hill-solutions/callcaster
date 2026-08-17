import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, beforeEach, vi } from "vitest";
import { resetWorkspaceEventSourcesForTests } from "@/lib/workspace-events-connection.client";

// Tests stub the global EventSource per test (createWorkspaceEventSourceMock);
// the shared workspace-events connection cache would otherwise hand one test's
// dead mock to the next.
afterEach(() => {
  resetWorkspaceEventSourcesForTests();
});

beforeAll(() => {
  // matchMedia is used by some UI libs (theme, radix, etc.)
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });

  // Some components may use these browser APIs.
  (globalThis as any).ResizeObserver ??= class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  window.scrollTo = vi.fn();
  HTMLElement.prototype.scrollIntoView = vi.fn();

  // jsdom implements no pointer-capture API. Radix primitives (Select, Dialog,
  // Popover) call these during a real click, so without them any test that
  // opens one dies with "target.hasPointerCapture is not a function" — an
  // uncaught exception rather than a readable assertion failure.
  HTMLElement.prototype.hasPointerCapture ??= () => false;
  HTMLElement.prototype.setPointerCapture ??= () => {};
  HTMLElement.prototype.releasePointerCapture ??= () => {};

  (globalThis as any).EventSource ??= class EventSource {
    url: string;
    withCredentials: boolean;
    readyState: number = 0;
    onopen: ((this: EventSource, ev: Event) => void) | null = null;
    onmessage: ((this: EventSource, ev: MessageEvent) => void) | null = null;
    onerror: ((this: EventSource, ev: Event) => void) | null = null;
    constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
      this.url = String(url);
      this.withCredentials = eventSourceInitDict?.withCredentials ?? false;
    }
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() { return true; }
    close() {}
  };
});

beforeEach(() => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.BETTER_AUTH_SECRET ??= "test-better-auth-secret";
  process.env.BASE_URL = "http://localhost";
  process.env.TWILIO_SID ??= "AC_test";
  process.env.TWILIO_AUTH_TOKEN ??= "twilio-token";
  process.env.TWILIO_APP_SID ??= "AP_test";
  process.env.TWILIO_PHONE_NUMBER ??= "+15555550100";
  process.env.STRIPE_SECRET_KEY ??= "sk_test";
  process.env.RESEND_API_KEY ??= "re_test";
  process.env.S3_ENDPOINT ??= "http://localhost:9000";
  process.env.S3_REGION ??= "us-east-1";
  process.env.S3_ACCESS_KEY_ID ??= "test-access-key";
  process.env.S3_SECRET_ACCESS_KEY ??= "test-secret-key";
  process.env.S3_BUCKET ??= "callcaster-test";
});

// Keep UI tests hermetic by default.
vi.stubGlobal(
  "fetch",
  vi.fn(async () => {
    throw new Error("Global fetch called without a test stub");
  }),
);

