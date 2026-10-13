import { describe, expect, test } from "vitest";

import {
  addIvrTransitionSource,
  readIvrTransitionSource,
} from "../app/lib/ivr-transition-timing.server";

describe("IVR transition timing", () => {
  test("carries the source block and ready time to the next Twilio request", () => {
    const url = addIvrTransitionSource(
      "https://base.example/api/ivr/1/page_2/b2/",
      { responseReadyAtMs: 1_000, pageId: "page_1", blockId: "b1" },
    );

    expect(url).toBe(
      "https://base.example/api/ivr/1/page_2/b2/?ivr_response_ready_at=1000&ivr_source_page_id=page_1&ivr_source_block_id=b1",
    );
    expect(readIvrTransitionSource(url, 1_075)).toEqual({
      responseReadyAtMs: 1_000,
      pageId: "page_1",
      blockId: "b1",
      responseToNextBlockMs: 75,
    });
  });

  test("ignores missing, invalid, and future response timestamps", () => {
    expect(readIvrTransitionSource("https://base.example/api/ivr/1/page_1/b1")).toBeNull();
    expect(
      readIvrTransitionSource(
        "https://base.example/api/ivr/1/page_1/b1?ivr_response_ready_at=bad&ivr_source_page_id=page_1&ivr_source_block_id=b1",
        100,
      ),
    ).toBeNull();
    expect(
      readIvrTransitionSource(
        "https://base.example/api/ivr/1/page_1/b1?ivr_response_ready_at=101&ivr_source_page_id=page_1&ivr_source_block_id=b1",
        100,
      ),
    ).toBeNull();
  });
});
