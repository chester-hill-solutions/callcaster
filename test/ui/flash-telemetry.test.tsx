import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * Flash telemetry (#1293): every error surface APPEARANCE — error/warning
 * toast, [role="alert"] banner — ships to the workspace endpoint with a
 * call-site stack and recent breadcrumbs. Capture must be observation-only:
 * the wrapped toast still fires, and a broken beacon never throws.
 */

const toastMock = vi.hoisted(() => ({
  error: vi.fn(() => "toast-id"),
  warning: vi.fn(() => "toast-id"),
  success: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: toastMock }));

const loggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/logger.client", () => ({ logger: loggerMock }));

import {
  installFlashTelemetry,
  recordFlashBreadcrumb,
} from "@/lib/flash-telemetry.client";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";

function sentBeacons(beacon: ReturnType<typeof vi.fn>) {
  return beacon.mock.calls.map(([url, blob]) => ({ url, blob }));
}

async function beaconPayload(blob: Blob) {
  // jsdom's Blob has no .text() and Node's Response won't ingest a jsdom
  // Blob; FileReader is the one reader jsdom actually implements.
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
  return JSON.parse(text);
}

describe("flash telemetry", () => {
  let beacon: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // install() wraps the mocked toast methods ONCE per process (module
    // latch); never restore the originals mid-file or later tests would call
    // the unwrapped versions. clearAllMocks resets the underlying vi.fns the
    // wrappers delegate to.
    vi.clearAllMocks();
    beacon = vi.fn(() => true);
    Object.defineProperty(window.navigator, "sendBeacon", {
      configurable: true,
      writable: true,
      value: beacon,
    });
    window.history.replaceState(
      null,
      "",
      `/workspaces/${WORKSPACE}/campaigns/1/call`,
    );
    installFlashTelemetry();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("toast.error still fires and its appearance beacons with stack + breadcrumbs", async () => {
    recordFlashBreadcrumb("dial-press", "type=call");
    const result = toastMock.error("This contact already has a call in progress.");

    expect(result).toBe("toast-id"); // original behavior preserved
    const beacons = sentBeacons(beacon);
    expect(beacons).toHaveLength(1);
    expect(beacons[0]!.url).toBe(
      `/api/workspaces/${WORKSPACE}/client-flash`,
    );
    const payload = await beaconPayload(beacons[0]!.blob as Blob);
    expect(payload.events[0]).toMatchObject({
      kind: "toast-error",
      message: "This contact already has a call in progress.",
    });
    expect(payload.events[0].stack).toContain("Error");
    expect(payload.events[0].breadcrumbs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "dial-press", detail: "type=call" }),
      ]),
    );
  });

  test("an appearing role=alert banner beacons its text", async () => {
    const banner = document.createElement("div");
    banner.setAttribute("role", "alert");
    banner.textContent = "Phone connection error RateExceededError (31206)";
    document.body.appendChild(banner);

    // MutationObserver delivers async.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const beacons = sentBeacons(beacon);
    expect(beacons).toHaveLength(1);
    const payload = await beaconPayload(beacons[0]!.blob as Blob);
    expect(payload.events[0]).toMatchObject({
      kind: "alert-banner",
      message: "Phone connection error RateExceededError (31206)",
    });
  });

  test("the same banner re-appearing immediately is deduped", async () => {
    for (let i = 0; i < 3; i++) {
      const banner = document.createElement("div");
      banner.setAttribute("role", "alert");
      banner.textContent = "Same repeated banner";
      document.body.appendChild(banner);
      await new Promise((resolve) => setTimeout(resolve, 0));
      banner.remove();
    }
    expect(sentBeacons(beacon)).toHaveLength(1);
  });

  test("outside a workspace URL nothing beacons, and the toast still works", () => {
    window.history.replaceState(null, "", "/pricing");
    const result = toastMock.error("boom");
    expect(result).toBe("toast-id");
    expect(beacon).not.toHaveBeenCalled();
  });

  test("a throwing beacon never breaks the toast", () => {
    beacon.mockImplementation(() => {
      throw new Error("beacon exploded");
    });
    expect(() => toastMock.error("still fine")).not.toThrow();
  });

  test("breadcrumbs are capped, keeping the most recent", async () => {
    for (let i = 0; i < 60; i++) {
      recordFlashBreadcrumb("fsm", `step-${i}`);
    }
    toastMock.warning("capped?");
    const payload = await beaconPayload(
      sentBeacons(beacon)[0]!.blob as Blob,
    );
    expect(payload.events[0].kind).toBe("toast-warning");
    expect(payload.events[0].breadcrumbs.length).toBeLessThanOrEqual(40);
    expect(
      payload.events[0].breadcrumbs.at(-1).detail,
    ).toBe("step-59");
  });
});
