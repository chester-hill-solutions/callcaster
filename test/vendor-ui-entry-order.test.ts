import { describe, expect, test, vi } from "vitest";

const fixture = vi.hoisted(() => ({ files: [] as string[] }));
vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs")>();
  return {
    ...original,
    readdirSync: (...args: Parameters<typeof original.readdirSync>) => {
      if (
        args[0] instanceof URL &&
        args[0].pathname.endsWith("/shad-cc/src/components/ui/")
      ) {
        return fixture.files;
      }
      return original.readdirSync(...args);
    },
  };
});

describe("vendored UI build entry contract", () => {
  test.each([
    { files: ["button.tsx", "readme.md", "alert.tsx", "button.test.tsx"] },
    { files: ["button.test.tsx", "alert.tsx", "readme.md", "button.tsx"] },
  ])(
    "uses the same named public paths for directory order $files",
    async ({ files }) => {
      fixture.files = files;
      vi.resetModules();
      const config = (
        await import("../vendor/chester-hill-solutions/shad-cc/tsup.config")
      ).default;
      if (typeof config === "function" || Array.isArray(config))
        throw new Error("Expected one build config");
      expect(config.entry).toEqual({
        "components/ui/alert": "src/components/ui/alert.tsx",
        "components/ui/button": "src/components/ui/button.tsx",
        "hooks/use-mobile": "src/hooks/use-mobile.ts",
        index: "src/index.ts",
        "lib/utils": "src/lib/utils.ts",
      });
      expect(Object.keys(config.entry ?? {})).toEqual([
        "components/ui/alert",
        "components/ui/button",
        "hooks/use-mobile",
        "index",
        "lib/utils",
      ]);
    },
  );
});
