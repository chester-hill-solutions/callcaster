import { describe, expect, test } from "vitest";
import {
  AUDIENCE_UPLOAD_CHUNK_DELAY_MS,
  AUDIENCE_UPLOAD_CHUNK_SIZE,
  AUDIENCE_UPLOAD_PROGRESS_NOTIFY_MS,
  audienceUploadChunkDelayMs,
  audienceUploadShouldWriteStatus,
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

describe("audienceUploadShouldWriteStatus", () => {
  test("skips mid-flight sidecar writes for single-chunk uploads", () => {
    expect(
      audienceUploadShouldWriteStatus({
        total: 1,
        isLastChunk: true,
        lastProgressAt: 0,
        now: 10_000,
      }),
    ).toBe(false);
    expect(
      audienceUploadShouldWriteStatus({
        total: 40,
        isLastChunk: true,
        lastProgressAt: 0,
        now: 10_000,
      }),
    ).toBe(false);
  });

  test("writes on last chunk or after notify interval for multi-chunk", () => {
    expect(
      audienceUploadShouldWriteStatus({
        total: 41,
        isLastChunk: true,
        lastProgressAt: 0,
        now: 100,
      }),
    ).toBe(true);
    expect(
      audienceUploadShouldWriteStatus({
        total: 80,
        isLastChunk: false,
        lastProgressAt: 0,
        now: AUDIENCE_UPLOAD_PROGRESS_NOTIFY_MS,
      }),
    ).toBe(true);
    expect(
      audienceUploadShouldWriteStatus({
        total: 80,
        isLastChunk: false,
        lastProgressAt: 1000,
        now: 1000 + AUDIENCE_UPLOAD_PROGRESS_NOTIFY_MS - 1,
      }),
    ).toBe(false);
  });
});
