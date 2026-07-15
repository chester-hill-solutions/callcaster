import { describe, expect, test } from "vitest";
import {
  aggregateIvrResponses,
  parseIvrResult,
  type IvrScriptShape,
} from "../app/lib/ivr-results";

const script: IvrScriptShape = {
  pages: {
    page_1: { title: "Intro", blocks: ["block_1"] },
    page_2: { title: "Follow up", blocks: ["block_2"] },
  },
  blocks: {
    block_1: { title: "Support?" },
    block_2: { title: "Volunteer?" },
  },
};

describe("parseIvrResult", () => {
  test("accepts an already-parsed object", () => {
    expect(parseIvrResult({ page_1: { "Support?": "1" } })).toEqual({
      page_1: { "Support?": "1" },
    });
  });

  test("parses the stringified form the column can also hold", () => {
    expect(parseIvrResult('{"page_1":{"Support?":"1"}}')).toEqual({
      page_1: { "Support?": "1" },
    });
  });

  test.each([
    ["null", null],
    ["undefined", undefined],
    ["empty string", ""],
    ["malformed JSON", "{not json"],
    ["a JSON array", "[1,2]"],
    ["a scalar", 42],
  ])("returns null for %s", (_label, input) => {
    expect(parseIvrResult(input)).toBeNull();
  });
});

describe("aggregateIvrResponses", () => {
  test("counts each distinct answer per question", () => {
    const results = aggregateIvrResponses(
      [
        { result: { page_1: { "Support?": "1" } } },
        { result: { page_1: { "Support?": "1" } } },
        { result: { page_1: { "Support?": "2" } } },
      ],
      script,
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      pageId: "page_1",
      pageTitle: "Intro",
      question: "Support?",
      isStaleKey: false,
      total: 3,
      options: [
        { value: "1", count: 2 },
        { value: "2", count: 1 },
      ],
    });
  });

  test("orders questions by the script's page order", () => {
    const results = aggregateIvrResponses(
      [{ result: { page_2: { "Volunteer?": "1" }, page_1: { "Support?": "1" } } }],
      script,
    );
    expect(results.map((r) => r.pageId)).toEqual(["page_1", "page_2"]);
  });

  test("keeps identically-titled blocks on different pages distinct", () => {
    const results = aggregateIvrResponses(
      [
        { result: { page_1: { Rating: "1" } } },
        { result: { page_2: { Rating: "5" } } },
      ],
      script,
    );
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.pageId)).toEqual(["page_1", "page_2"]);
  });

  test("keeps responses recorded under a since-renamed block title, flagged as stale", () => {
    // The webhook keys on the editable block title, so attempts recorded before
    // a rename keep the old key forever. Dropping them would under-report.
    const results = aggregateIvrResponses(
      [
        { result: { page_1: { "Old title": "1" } } },
        { result: { page_1: { "Support?": "1" } } },
      ],
      script,
    );

    expect(results).toHaveLength(2);
    const stale = results.find((r) => r.question === "Old title");
    expect(stale).toMatchObject({ isStaleKey: true, total: 1 });
    expect(results.find((r) => r.question === "Support?")).toMatchObject({
      isStaleKey: false,
    });
  });

  test("treats a block id as a valid key when its block has no title", () => {
    const untitled: IvrScriptShape = {
      pages: { page_1: { title: "Intro", blocks: ["block_9"] } },
      blocks: { block_9: {} },
    };
    const results = aggregateIvrResponses(
      [{ result: { page_1: { block_9: "3" } } }],
      untitled,
    );
    expect(results[0]).toMatchObject({ question: "block_9", isStaleKey: false });
  });

  test("skips attempts and answers with no usable response", () => {
    const results = aggregateIvrResponses(
      [
        { result: null },
        { result: "{bad" },
        { result: { page_1: { "Support?": "" } } },
        { result: { page_1: { "Support?": null } } },
        { result: { page_1: "not-an-object" } },
        { result: { page_1: { "Support?": "1" } } },
      ],
      script,
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ total: 1, options: [{ value: "1", count: 1 }] });
  });

  test("returns an empty list when nothing was recorded", () => {
    expect(aggregateIvrResponses([], script)).toEqual([]);
  });

  test("aggregates without a script, marking nothing stale", () => {
    const results = aggregateIvrResponses([{ result: { page_1: { "Support?": "1" } } }]);
    expect(results[0]).toMatchObject({
      pageTitle: null,
      isStaleKey: false,
      total: 1,
    });
  });
});
