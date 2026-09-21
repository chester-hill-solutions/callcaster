import { RuleTester } from "eslint";
import { describe, expect, test } from "vitest";

import { noUselessComments } from "../eslint-rules/no-useless-comments.mjs";

// RuleTester registers its own suites, so it must run at module scope, not
// inside a vitest test.
const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: "latest", sourceType: "module" },
});

ruleTester.run("no-useless-comments", noUselessComments as never, {
  valid: [
    "// explains why the retry exists",
    "// #1936 tracks this follow-up",
    "// falls through",
    "// https://example.com/spec",
    "const x = 1; // the sentinel value",
    "// TODO(#1936): remove after the migration",
    // An empty comment is a different concern and is not flagged.
    "//",
    "/** */",
  ],
  invalid: [
    { code: "// 123", errors: [{ messageId: "useless" }] },
    { code: "// #123", errors: [{ messageId: "useless" }] },
    { code: "// ----------", errors: [{ messageId: "useless" }] },
    { code: "// ====", errors: [{ messageId: "useless" }] },
    { code: "/* **** */", errors: [{ messageId: "useless" }] },
  ],
});

describe("callcaster/no-useless-comments wiring (#1936)", () => {
  test("is registered in the flat config as an error via the local plugin", async () => {
    const config = (await import("../eslint.config.mjs")).default as Array<{
      plugins?: Record<string, { rules?: Record<string, unknown> }>;
      rules?: Record<string, unknown>;
    }>;
    const entry = config.find((block) =>
      Object.prototype.hasOwnProperty.call(
        block.rules ?? {},
        "callcaster/no-useless-comments",
      ),
    );
    expect(entry?.rules?.["callcaster/no-useless-comments"]).toBe("error");
    expect(entry?.plugins?.callcaster?.rules?.["no-useless-comments"]).toBe(
      noUselessComments,
    );
  });
});
