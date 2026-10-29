import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, expect, test } from "vitest";

const installed = createRequire(import.meta.url);
const consumer = createRequire(installed.resolve("@hey-api/openapi-ts"));
const handlebars: typeof import("handlebars") = consumer("handlebars");
const MARKER = "OWNED_AST_EXECUTED_3072";

function malformedProgram() {
  const ast = handlebars.parse("{{#with ok}}safe{{/with}}");
  Object.defineProperty(ast.body[0], "program", {
    value: {
      type: "Program",
      body: [],
      loc: ast.loc,
      blockParams: { length: `(()=>{throw new Error('${MARKER}')})()` },
    },
  });
  return ast;
}

describe("the API generator's installed Handlebars compiler (#3072)", () => {
  test("compile rejects malformed AST metadata before its injected expression runs", () => {
    assert.throws(
      () => handlebars.compile(malformedProgram())({ ok: true }),
      (error) => error instanceof Error && !error.message.includes(MARKER),
    );
  });

  test("precompile rejects malformed AST metadata instead of emitting executable input", () => {
    expect(() => handlebars.precompile(malformedProgram())).toThrow();
  });

  test("prototype constructor access stays denied with broad prototype-method access", () => {
    const render = handlebars.compile(
      '{{lookup (lookup fn "__proto__") "constructor"}}',
    );
    expect(
      render({ fn: () => "fixture" }, { allowProtoMethodsByDefault: true }),
    ).toBe("");
  });

  test("ordinary strings and valid parsed templates retain escaped block output", () => {
    const source =
      "{{#each names}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}";
    const context = { names: ["Ann & Bo", "Cal"] };
    expect(handlebars.compile(source)(context)).toBe("Ann &amp; Bo, Cal");
    expect(handlebars.compile(handlebars.parse(source))(context)).toBe(
      "Ann &amp; Bo, Cal",
    );
  });
});
