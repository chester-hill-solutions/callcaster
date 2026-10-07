import { describe, expect, it } from "vitest";
import {
  SourceMapConsumer,
  SourceMapGenerator,
  SourceNode,
  type RawSourceMap,
} from "source-map-js";

const basicMap: RawSourceMap = {
  version: "3",
  sources: ["owned.js"],
  sourcesContent: ["owned source"],
  names: [],
  mappings: "AAAA",
};

function indexedMap(line: unknown, column: unknown = 0, map = basicMap) {
  // The package types omit indexed maps; the real consumer selects sections.
  return {
    ...basicMap,
    sections: [{ offset: { line, column }, map }],
  };
}

const originalStart = {
  source: "owned.js",
  line: 1,
  column: 0,
  name: null,
};

// These cases construct maps and look up positions. They never expand large maps.
describe("installed source-map offset boundary (GHSA-68fv-2mgg-jv7q)", () => {
  it.each([
    { name: "infinite line", line: Infinity },
    { name: "NaN line", line: NaN },
    { name: "fractional line", line: 1.5 },
    { name: "string line", line: "1" },
    { name: "null line", line: null },
  ])("rejects $name before expansion", ({ line }) => {
    expect(() => new SourceMapConsumer(indexedMap(line))).toThrow();
  });

  it.each([
    { name: "infinite column", column: Infinity },
    { name: "fractional column", column: 1.5 },
  ])("rejects $name before expansion", ({ column }) => {
    expect(() => new SourceMapConsumer(indexedMap(0, column))).toThrow();
  });

  it("rejects a section beyond the supported line limit", () => {
    expect(() => new SourceMapConsumer(indexedMap(10_000_001))).toThrow();
  });

  it("rejects a nested total beyond the supported line limit", () => {
    expect(
      () =>
        new SourceMapConsumer(indexedMap(6_000_000, 0, indexedMap(5_000_000))),
    ).toThrow();
  });

  it("preserves a basic source position", () => {
    const consumer = new SourceMapConsumer(basicMap);
    expect(consumer.originalPositionFor({ line: 1, column: 0 })).toEqual(
      originalStart,
    );
  });

  it.each([
    {
      name: "indexed line and column offsets",
      map: indexedMap(2, 4),
      position: { line: 3, column: 5 },
    },
    {
      name: "nested valid offsets",
      map: indexedMap(2, 0, indexedMap(3)),
      position: { line: 6, column: 2 },
    },
    {
      name: "the maximum supported section line",
      map: indexedMap(10_000_000),
      position: { line: 10_000_001, column: 1 },
    },
    {
      name: "the maximum supported nested total",
      map: indexedMap(5_000_000, 0, indexedMap(5_000_000)),
      position: { line: 10_000_001, column: 2 },
    },
  ])("preserves $name", ({ map, position }) => {
    const consumer = new SourceMapConsumer(map);
    expect(consumer.originalPositionFor(position)).toEqual(originalStart);
  });

  it("preserves generated code and source content through SourceNode", () => {
    const node = SourceNode.fromStringWithSourceMap(
      "owned\n",
      new SourceMapConsumer(basicMap),
    );
    const output = node.toStringWithSourceMap({ file: "owned.out.js" });
    expect(output.code).toBe("owned\n");
    const consumer = new SourceMapConsumer(output.map.toJSON());
    expect(consumer.sourceContentFor("owned.js")).toBe("owned source");
    expect(consumer.originalPositionFor({ line: 1, column: 0 })).toEqual(
      originalStart,
    );
  });

  it("preserves a generator source location and name", () => {
    const generator = new SourceMapGenerator({ file: "owned.out.js" });
    generator.addMapping({
      generated: { line: 2, column: 3 },
      original: { line: 7, column: 4 },
      source: "owned.ts",
      name: "ownedHandler",
    });
    const consumer = new SourceMapConsumer(generator.toJSON());
    expect(consumer.originalPositionFor({ line: 2, column: 3 })).toEqual({
      source: "owned.ts",
      line: 7,
      column: 4,
      name: "ownedHandler",
    });
  });
});
