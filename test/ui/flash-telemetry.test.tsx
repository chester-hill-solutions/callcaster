import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Alert } from "@/components/ui/alert";

/**
 * Flash telemetry (#1293): every error surface APPEARANCE — error/warning
 * toast, explicitly classified notice — ships to the workspace endpoint with a
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
      severity: "error",
      message: "This contact already has a call in progress.",
    });
    expect(payload.events[0].stack).toContain("Error");
    expect(payload.events[0].breadcrumbs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "dial-press", detail: "type=call" }),
      ]),
    );
  });

  test("an explicitly marked error banner beacons its text", async () => {
    const banner = document.createElement("div");
    banner.setAttribute("role", "alert");
    banner.setAttribute("data-severity", "error");
    banner.textContent = "Phone connection error RateExceededError (31206)";
    document.body.appendChild(banner);

    // MutationObserver delivers async.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const beacons = sentBeacons(beacon);
    expect(beacons).toHaveLength(1);
    const payload = await beaconPayload(beacons[0]!.blob as Blob);
    expect(payload.events[0]).toMatchObject({
      kind: "alert-banner",
      severity: "error",
      message: "Phone connection error RateExceededError (31206)",
    });
  });

  test("the same banner re-appearing immediately is deduped", async () => {
    for (let i = 0; i < 3; i++) {
      const banner = document.createElement("div");
      banner.setAttribute("role", "alert");
      banner.setAttribute("data-severity", "error");
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
    expect(payload.events[0].severity).toBe("warning");
    expect(payload.events[0].breadcrumbs.length).toBeLessThanOrEqual(40);
    expect(
      payload.events[0].breadcrumbs.at(-1).detail,
    ).toBe("step-59");
  });

  test.each([
    [undefined, "neutral", "info"],
    ["info", "info", "info"],
    ["success", "success", "info"],
    ["warning", "warning", "warn"],
    ["destructive", "error", "error"],
  ] as const)("real Alert variant %s ships its meaning at %s level", async (variant, severity, level) => {
    render(<Alert variant={variant}>{`Result for ${severity}`}</Alert>);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(beacon).toHaveBeenCalledTimes(1);
    const payload = await beaconPayload(beacon.mock.calls[0][1]);
    expect(payload.events[0]).toMatchObject({ kind: "alert-banner", severity, message: `Result for ${severity}` });
    expect(loggerMock[level]).toHaveBeenCalledTimes(1);
    if (level === "info") {
      expect(loggerMock.warn).not.toHaveBeenCalled();
      expect(loggerMock.error).not.toHaveBeenCalled();
    }
  });

  test("an unclassified role=alert announcement is not a severity signal", async () => {
    const node = document.createElement("div");
    node.role = "alert";
    node.textContent = "Plain announcement";
    document.body.append(node);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(beacon).not.toHaveBeenCalled();
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  test("a same-text success becomes an error on the same node without deduplication loss", async () => {
    const { rerender } = render(<Alert variant="success" role="status">Updated result</Alert>);
    await new Promise((resolve) => setTimeout(resolve, 0));
    rerender(<Alert variant="destructive" role="status">Updated result</Alert>);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(beacon).toHaveBeenCalledTimes(2);
    const payloads = await Promise.all(beacon.mock.calls.map(([, blob]) => beaconPayload(blob)));
    expect(payloads.map(p => p.events[0].severity)).toEqual(["success", "error"]);
    expect(screen.getByRole("status")).toHaveTextContent("Updated result");
  });

  test("dynamically inserted overlay notices can omit a role", async () => {
    render(<div><Alert variant="warning" role={undefined}>Overlay warning</Alert></div>);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(beacon).toHaveBeenCalledTimes(1);
    const payload = await beaconPayload(beacon.mock.calls[0][1]);
    expect(payload.events[0]).toMatchObject({ severity: "warning", message: "Overlay warning" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("text updates within an existing semantic notice are captured once", async () => {
    const { rerender } = render(<Alert variant="destructive"><span>First error detail</span></Alert>);
    await new Promise((resolve) => setTimeout(resolve, 0));
    rerender(<Alert variant="destructive"><span>Changed error detail</span></Alert>);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(beacon).toHaveBeenCalledTimes(2);
    const payload = await beaconPayload(beacon.mock.calls[1][1]);
    expect(payload.events[0]).toMatchObject({ severity: "error", message: "Changed error detail" });
  });

  test("sonner descendants are excluded because toast calls already carry their stacks", async () => {
    render(<div data-sonner-toaster><Alert variant="destructive">Toast DOM duplicate</Alert></div>);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(beacon).not.toHaveBeenCalled();
  });

  test("a rejected beacon uses the keepalive fetch fallback", async () => {
    beacon.mockReturnValue(false);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      toastMock.error("Fallback error");
      expect(fetchMock).toHaveBeenCalledWith(`/api/workspaces/${WORKSPACE}/client-flash`, expect.objectContaining({ method: "POST", keepalive: true }));
      const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(payload.events[0]).toMatchObject({ kind: "toast-error", severity: "error", message: "Fallback error" });
    } finally { vi.unstubAllGlobals(); }
  });

  test("an unchanged severity is not recaptured when only the announcement role changes", async () => {
    const { rerender } = render(<Alert variant="warning">Role change control</Alert>);
    await new Promise((resolve) => setTimeout(resolve, 0));
    rerender(<Alert variant="warning" role="status">Role change control</Alert>);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveAttribute("data-severity", "warning");
  });

  test("error deduplication expires and never crosses workspace attribution", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(100_000);
    try {
      const { rerender } = render(<Alert variant="destructive">Dedupe attribution error</Alert>);
      await new Promise((resolve) => setTimeout(resolve, 0));
      rerender(<div />);
      clock.mockReturnValue(106_000);
      rerender(<Alert variant="destructive">Dedupe attribution error</Alert>);
      await new Promise((resolve) => setTimeout(resolve, 0));
      window.history.replaceState(null, "", "/workspaces/22222222-2222-4222-8222-222222222222/call");
      rerender(<div />);
      rerender(<Alert variant="destructive">Dedupe attribution error</Alert>);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(beacon).toHaveBeenCalledTimes(3);
      expect(beacon.mock.calls[2][0]).toBe("/api/workspaces/22222222-2222-4222-8222-222222222222/client-flash");
    } finally { clock.mockRestore(); }
  });

  test("invalid semantic metadata is not inferred from an alert role", async () => {
    render(<div role="alert" data-severity="destructive">Invalid marker</div>);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(beacon).not.toHaveBeenCalled();
  });
});
