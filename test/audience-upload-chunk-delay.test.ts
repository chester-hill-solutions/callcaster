import { describe, expect, test } from "vitest";
import {
  AUDIENCE_UPLOAD_CHUNK_DELAY_MS,
  AUDIENCE_UPLOAD_CHUNK_SIZE,
  audienceUploadChunkDelayMs,
} from "../shared/audience-upload";

describe("audienceUploadChunkDelayMs", () => {
  test("CHUNK_SIZE is 40 for QC alignment", () => {
    expect(AUDIENCE_UPLOAD_CHUNK_SIZE).toBe(40);
  });

  test("skips artificial delay for single-chunk uploads (#1078)", () => {
    expect(audienceUploadChunkDelayMs(1)).toBe(0);
    expect(audienceUploadChunkDelayMs(40)).toBe(0);
    expect(audienceUploadChunkDelayMs(AUDIENCE_UPLOAD_CHUNK_SIZE)).toBe(0);
  });

  test("keeps yield delay for multi-chunk uploads", () => {
    expect(audienceUploadChunkDelayMs(41)).toBe(AUDIENCE_UPLOAD_CHUNK_DELAY_MS);
    expect(audienceUploadChunkDelayMs(AUDIENCE_UPLOAD_CHUNK_SIZE + 1)).toBe(
      AUDIENCE_UPLOAD_CHUNK_DELAY_MS,
    );
    expect(audienceUploadChunkDelayMs(500)).toBe(AUDIENCE_UPLOAD_CHUNK_DELAY_MS);
  });
});
