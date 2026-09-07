import { afterEach, describe, expect, test } from "vitest";

import { isDesignGalleryEnabled } from "@/lib/env.server";

// Roadmap E3.3: the tone-system workbench is not a customer surface.
const saved = { NODE_ENV: process.env.NODE_ENV, E2E_TEST: process.env.E2E_TEST, FLAG: process.env.DESIGN_GALLERY_ENABLED };

function setEnv(env: { NODE_ENV?: string; E2E_TEST?: string; DESIGN_GALLERY_ENABLED?: string }) {
  for (const key of ["NODE_ENV", "E2E_TEST", "DESIGN_GALLERY_ENABLED"] as const) {
    const value = env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => setEnv({ NODE_ENV: saved.NODE_ENV, E2E_TEST: saved.E2E_TEST, DESIGN_GALLERY_ENABLED: saved.FLAG }));

describe("isDesignGalleryEnabled", () => {
  test("is on in development", () => {
    setEnv({ NODE_ENV: "development" });
    expect(isDesignGalleryEnabled()).toBe(true);
  });

  test("is off in production unless explicitly enabled", () => {
    setEnv({ NODE_ENV: "production" });
    expect(isDesignGalleryEnabled()).toBe(false);
    setEnv({ NODE_ENV: "production", DESIGN_GALLERY_ENABLED: "1" });
    expect(isDesignGalleryEnabled()).toBe(true);
  });

  test("stays on for the E2E harness, which runs as production", () => {
    setEnv({ NODE_ENV: "production", E2E_TEST: "1" });
    expect(isDesignGalleryEnabled()).toBe(true);
  });

  test("an explicit false wins everywhere", () => {
    setEnv({ NODE_ENV: "development", DESIGN_GALLERY_ENABLED: "false" });
    expect(isDesignGalleryEnabled()).toBe(false);
  });
});
