import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import type { ProcessOptions } from "postcss";
import { compileStyle } from "@vue/compiler-sfc";
import { afterAll, describe, expect, test } from "vitest";

const require = createRequire(import.meta.url);
const vitestRequire = createRequire(require.resolve("vitest"));
const scriptkitRequire = createRequire(
  require.resolve("@chester-hill-solutions/scriptkit-call-script-react"),
);
const scriptkitVitestRequire = createRequire(
  scriptkitRequire.resolve("vitest"),
);
const consumers = [
  { name: "direct PostCSS", require },
  {
    name: "Vue compiler",
    require: createRequire(require.resolve("@vue/compiler-sfc")),
  },
  { name: "Vite", require: createRequire(require.resolve("vite")) },
  { name: "shadcn CLI", require: createRequire(require.resolve("shadcn")) },
  {
    name: "root Vitest's Vite",
    require: createRequire(vitestRequire.resolve("vite")),
  },
  {
    name: "ScriptKit Vitest's Vite",
    require: createRequire(scriptkitVitestRequire.resolve("vite")),
  },
];

const directory = mkdtempSync(join(tmpdir(), "callcaster-postcss-"));
const cssDirectory = join(directory, "css");
mkdirSync(cssDirectory);
const from = join(cssDirectory, "input.css");
const outside = join(directory, "outside.map");
const marker = "OWNED_FIXTURE_MAP_CONTENT";
const sourceMap = {
  version: 3,
  sources: ["original.css"],
  sourcesContent: [marker],
  names: [],
  mappings: "AAAA",
};
writeFileSync(outside, JSON.stringify(sourceMap));
writeFileSync(join(cssDirectory, "input.css.map"), JSON.stringify(sourceMap));
const css = ".example { color: red }";
const inlineMap =
  "data:application/json;base64," +
  Buffer.from(JSON.stringify(sourceMap)).toString("base64");

afterAll(() => rmSync(directory, { recursive: true, force: true }));

const cases: {
  name: string;
  annotation: string;
  options: ProcessOptions;
  markerPresent: boolean;
}[] = [
  {
    name: "rejects traversal outside the CSS directory",
    annotation: "../outside.map",
    options: { from, map: true },
    markerPresent: false,
  },
  {
    name: "rejects an absolute outside map without a CSS filename",
    annotation: outside,
    options: { map: true },
    markerPresent: false,
  },
  {
    name: "rejects a traversing outside map without a CSS filename",
    annotation: relative(process.cwd(), outside),
    options: { map: true },
    markerPresent: false,
  },
  {
    name: "retains a same-directory external source map",
    annotation: "input.css.map",
    options: { from, map: true },
    markerPresent: true,
  },
  {
    name: "retains an inline source map without a CSS filename",
    annotation: inlineMap,
    options: { map: { inline: false } },
    markerPresent: true,
  },
  {
    name: "retains an explicitly supplied trusted previous map",
    annotation: "",
    options: { from, map: { prev: () => outside, inline: false } },
    markerPresent: true,
  },
  {
    name: "retains ordinary CSS without source mapping",
    annotation: "",
    options: { from, map: false },
    markerPresent: false,
  },
];

for (const consumer of consumers) {
  describe(`${consumer.name} source-map boundary`, () => {
    const postcss: typeof import("postcss") = consumer.require("postcss");

    test.each(cases)("$name", async (fixture) => {
      const source = fixture.annotation
        ? `${css}\n/*# sourceMappingURL=${fixture.annotation} */`
        : css;
      const result = await postcss([]).process(source, fixture.options);
      expect(
        JSON.stringify(result.map?.toJSON() ?? null).includes(marker),
      ).toBe(fixture.markerPresent);
      expect(result.root?.first).toMatchObject({
        selector: ".example",
        nodes: [{ prop: "color", value: "red" }],
      });
    });
  });
}

describe("real Vue style compilation", () => {
  test.each([
    { name: "outside annotation", annotation: "../outside.map", mapped: false },
    {
      name: "valid local annotation",
      annotation: "input.css.map",
      mapped: true,
    },
    { name: "ordinary scoped CSS", annotation: "", mapped: false },
  ])("preserves scoped CSS with $name", (fixture) => {
    const result = compileStyle({
      source: fixture.annotation
        ? `${css}\n/*# sourceMappingURL=${fixture.annotation} */`
        : css,
      filename: from,
      id: "data-v-fixture",
      scoped: true,
      postcssOptions: { map: { inline: false } },
    });
    expect(result.errors).toEqual([]);
    expect(result.code).toContain(".example[data-v-fixture]");
    expect(result.code).toMatch(/color:\s*red/);
    expect(JSON.stringify(result.map ?? null).includes(marker)).toBe(
      fixture.mapped,
    );
  });
});
