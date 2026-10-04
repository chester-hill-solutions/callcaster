import { expect, test } from "vitest";
import {
  FormBodyError,
  readBoundedFormData,
} from "../app/lib/bounded-form-data.server";

function streamedRequest(bytes: Uint8Array, length?: string) {
  let offset = 0;
  let pulls = 0;
  let cancelled = false;
  let cancelDone: () => void = () => {};
  const cancellation = new Promise<void>((resolve) => {
    cancelDone = resolve;
  });
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls++;
        if (offset === bytes.length) return controller.close();
        controller.enqueue(bytes.slice(offset, offset + 16));
        offset = Math.min(offset + 16, bytes.length);
      },
      cancel() {
        cancelled = true;
        cancelDone();
      },
    },
    { highWaterMark: 0 },
  );
  const headers = new Headers({
    "content-type": "multipart/form-data; boundary=fixture",
  });
  if (length) headers.set("content-length", length);
  const request = new Request("http://fixture.invalid", {
    method: "POST",
    headers,
    body: stream,
    duplex: "half",
  });
  return {
    request,
    cancellation,
    state: () => ({ pulls, cancelled, unread: offset < bytes.length }),
  };
}

function multipart(size: number) {
  return new TextEncoder().encode(
    '--fixture\r\nContent-Disposition: form-data; name="file"; filename="clip.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n' +
      "x".repeat(size) +
      "\r\n--fixture--\r\n",
  );
}

test.each([undefined, "1"])(
  "actual stream limit cancels overflow with declared length %s",
  async (length) => {
    const fixture = streamedRequest(multipart(1024), length);
    await expect(
      readBoundedFormData(fixture.request, 256),
    ).rejects.toMatchObject({ status: 413 });
    await fixture.cancellation;
    expect(fixture.state()).toMatchObject({ cancelled: true, unread: true });
    expect(fixture.state().pulls).toBeLessThan(20);
    expect(fixture.request.bodyUsed).toBe(true);
  },
);

test("honest oversized length rejects and cancels before the first pull", async () => {
  const fixture = streamedRequest(multipart(16), "1024");
  await expect(readBoundedFormData(fixture.request, 256)).rejects.toMatchObject(
    { status: 413 },
  );
  await fixture.cancellation;
  expect(fixture.state()).toEqual({ pulls: 0, cancelled: true, unread: true });
});

test("source cancellation failure cannot hide the declared-size rejection", async () => {
  const body = new ReadableStream<Uint8Array>(
    {
      cancel() {
        throw new Error("Source close failed");
      },
    },
    { highWaterMark: 0 },
  );
  const request = new Request("http://fixture.invalid", {
    method: "POST",
    body,
    duplex: "half",
    headers: { "content-length": "1024" },
  });
  await expect(readBoundedFormData(request, 256)).rejects.toMatchObject({
    status: 413,
  });
});

test("exact encoded byte budget succeeds; one byte less rejects", async () => {
  const bytes = multipart(16);
  const valid = streamedRequest(bytes);
  const form = await readBoundedFormData(valid.request, bytes.byteLength);
  const file = form.get("file");
  expect(file).toBeInstanceOf(File);
  if (!(file instanceof File)) throw new Error("Missing parsed file");
  expect(await file.text()).toBe("x".repeat(16));
  expect(valid.state().cancelled).toBe(false);
  expect(valid.request.bodyUsed).toBe(true);
  const invalid = streamedRequest(bytes);
  await expect(
    readBoundedFormData(invalid.request, bytes.byteLength - 1),
  ).rejects.toMatchObject({ status: 413 });
});

test("urlencoded deletion form shares the byte bound", async () => {
  const request = new Request("http://fixture.invalid", {
    method: "DELETE",
    body: new URLSearchParams({ fileName: "clip.mp3" }),
  });
  expect((await readBoundedFormData(request, 256)).get("fileName")).toBe(
    "clip.mp3",
  );
  await expect(
    readBoundedFormData(
      new Request("http://fixture.invalid", {
        method: "DELETE",
        body: new URLSearchParams({ fileName: "x".repeat(300) }),
      }),
      256,
    ),
  ).rejects.toBeInstanceOf(FormBodyError);
});
