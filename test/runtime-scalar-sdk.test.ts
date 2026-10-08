import { describe, expect, test } from "vitest";
import { z } from "zod";
import { APICallError } from "@ai-sdk/provider";
import {
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  createStatusCodeErrorResponseHandler,
  DownloadError,
  readResponseWithSizeLimit,
} from "@ai-sdk/provider-utils";

const url = "https://fixture.invalid/response";
const responseSchema = z.object({ ok: z.boolean() });
const errorSchema = z.object({ error: z.string() });

function streamFixture(chunks: string[]) {
  const state = { reads: 0, cancellations: 0 };
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        const chunk = chunks[state.reads];
        state.reads++;
        if (chunk === undefined) {
          controller.close();
          return;
        }
        controller.enqueue(new TextEncoder().encode(chunk));
        if (state.reads === chunks.length) controller.close();
      },
      cancel() {
        state.cancellations++;
      },
    },
    { highWaterMark: 0 },
  );
  return { body, state };
}

describe("Scalar SDK response handlers", () => {
  test.each([
    {
      name: "JSON success",
      build: () => createJsonResponseHandler(responseSchema),
    },
    {
      name: "JSON error",
      build: () =>
        createJsonErrorResponseHandler({
          errorSchema,
          errorToMessage: (value) => value.error,
        }),
    },
    {
      name: "status error",
      build: () => createStatusCodeErrorResponseHandler(),
    },
  ])(
    "$name rejects oversized declarations before reading and cancels the body",
    async ({ build }) => {
      const { body, state } = streamFixture(['{"ok":true,"error":"fixture"}']);
      const response = new Response(body, {
        headers: { "content-length": "2147483649" },
      });
      const result = build()({ response, url, requestBodyValues: {} });
      await expect(result).rejects.toBeInstanceOf(DownloadError);
      await expect(result).rejects.toThrow("maximum size of 2147483648 bytes");
      expect(state).toEqual({ reads: 0, cancellations: 1 });
      expect(body.locked).toBe(false);
    },
  );

  test("validates normal JSON without losing the raw value or response headers", async () => {
    const response = new Response('{"ok":true}', {
      headers: { "x-fixture": "normal" },
    });
    const result = await createJsonResponseHandler(responseSchema)({
      response,
      url,
      requestBodyValues: {},
    });
    expect(result.value).toEqual({ ok: true });
    expect(result.rawValue).toEqual({ ok: true });
    expect(result.responseHeaders?.["x-fixture"]).toBe("normal");
  });

  test("retains provider error data and retry classification", async () => {
    const response = new Response('{"error":"Provider refused"}', {
      status: 429,
    });
    const handler = createJsonErrorResponseHandler({
      errorSchema,
      errorToMessage: (value) => value.error,
      isRetryable: (providerResponse) => providerResponse.status === 429,
    });
    const { value } = await handler({
      response,
      url,
      requestBodyValues: { source: "docs" },
    });
    expect(APICallError.isInstance(value)).toBe(true);
    expect(value).toMatchObject({
      message: "Provider refused",
      statusCode: 429,
      isRetryable: true,
      responseBody: '{"error":"Provider refused"}',
      data: { error: "Provider refused" },
    });
  });

  test("retains a normal non-JSON status error", async () => {
    const response = new Response("Service unavailable", {
      status: 503,
      statusText: "Unavailable",
    });
    const { value } = await createStatusCodeErrorResponseHandler()({
      response,
      url,
      requestBodyValues: {},
    });
    expect(value).toMatchObject({
      statusCode: 503,
      message: "Unavailable",
      responseBody: "Service unavailable",
    });
  });
});

describe("Scalar SDK stream limits", () => {
  test("incremental overflow cancels before later chunks and releases the reader", async () => {
    const { body, state } = streamFixture(["abcd", "efghi", "later"]);
    const result = readResponseWithSizeLimit({
      response: new Response(body),
      url,
      maxBytes: 8,
    });
    await expect(result).rejects.toBeInstanceOf(DownloadError);
    await expect(result).rejects.toThrow("maximum size of 8 bytes");
    expect(state).toEqual({ reads: 2, cancellations: 1 });
    expect(body.locked).toBe(false);
  });

  test("an exact-limit stream keeps every byte and releases the reader", async () => {
    const { body, state } = streamFixture(["abcd", "efgh"]);
    const value = await readResponseWithSizeLimit({
      response: new Response(body),
      url,
      maxBytes: 8,
    });
    expect(new TextDecoder().decode(value)).toBe("abcdefgh");
    expect(state.reads).toBe(2);
    expect(body.locked).toBe(false);
  });

  test("an explicit Content-Length limit cancels without pulling the body", async () => {
    const { body, state } = streamFixture(["x"]);
    const response = new Response(body, { headers: { "content-length": "9" } });
    await expect(
      readResponseWithSizeLimit({ response, url, maxBytes: 8 }),
    ).rejects.toBeInstanceOf(DownloadError);
    expect(state).toEqual({ reads: 0, cancellations: 1 });
    expect(body.locked).toBe(false);
  });
});
