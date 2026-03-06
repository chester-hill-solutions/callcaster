import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    hydrateRoot: vi.fn(),
    startTransition: vi.fn((cb: any) => cb()),
  };
});

vi.mock("@remix-run/react", () => ({
  RemixBrowser: () => null,
}));

vi.mock("react-dom/client", () => ({
  hydrateRoot: (...args: any[]) => mocks.hydrateRoot(...args),
}));

vi.mock("react", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    startTransition: (...args: any[]) => mocks.startTransition(...args),
  };
});

describe("entry.client.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.hydrateRoot.mockReset();
    mocks.startTransition.mockClear();
  });

  test("sets global Buffer and hydrates inside startTransition", async () => {
    const prev = (globalThis as any).Buffer;
    try {
      delete (globalThis as any).Buffer;
    } catch {
      (globalThis as any).Buffer = undefined;
    }

    await import("../../app/entry.client");

    expect(mocks.startTransition).toHaveBeenCalled();
    expect((globalThis as any).Buffer).toBeTruthy();
    expect(mocks.hydrateRoot).toHaveBeenCalled();

    (globalThis as any).Buffer = prev;
  });
});

