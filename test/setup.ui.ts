import "@testing-library/jest-dom/vitest";
import { beforeAll, vi } from "vitest";

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
});

// Keep UI tests hermetic by default.
vi.stubGlobal(
  "fetch",
  vi.fn(async () => {
    throw new Error("Global fetch called without a test stub");
  }),
);

