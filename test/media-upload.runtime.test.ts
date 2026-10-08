import { expect, test } from "bun:test";
import { readBoundedFormData } from "../app/lib/bounded-form-data.server";
import { validateMediaFile } from "../app/lib/media-upload.server";

function multipart(name: string, type: string, size: number) {
  const prefix = new TextEncoder().encode(
    `--fixture\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n`,
  );
  const suffix = new TextEncoder().encode("\r\n--fixture--\r\n");
  const bytes = new Uint8Array(prefix.length + size + suffix.length);
  bytes.set(prefix);
  bytes.fill(120, prefix.length, prefix.length + size);
  bytes.set(suffix, prefix.length + size);
  return bytes;
}

function request(body: BodyInit, length?: string) {
  const headers = new Headers({
    "content-type": "multipart/form-data; boundary=fixture",
  });
  if (length) headers.set("content-length", length);
  return new Request("http://fixture.invalid", {
    method: "POST",
    headers,
    body,
    duplex: "half",
  });
}

test.each([
  {
    name: "audio exact cap",
    kind: "audio",
    size: 10485760,
    file: "clip.mp3",
    type: "audio/mpeg",
    ok: true,
  },
  {
    name: "audio cap+1",
    kind: "audio",
    size: 10485761,
    file: "clip.mp3",
    type: "audio/mpeg",
    ok: false,
  },
  {
    name: "message exact cap",
    kind: "message",
    size: 10485760,
    file: "clip.png",
    type: "image/png",
    ok: true,
  },
  {
    name: "message cap+1",
    kind: "message",
    size: 10485761,
    file: "clip.png",
    type: "image/png",
    ok: false,
  },
  {
    name: "audio WebM",
    kind: "audio",
    size: 1,
    file: "clip.webm",
    type: "audio/webm",
    ok: true,
  },
  {
    name: "audio OGA",
    kind: "audio",
    size: 1,
    file: "clip.oga",
    type: "audio/ogg",
    ok: true,
  },
  {
    name: "message WebM stays invalid",
    kind: "message",
    size: 1,
    file: "clip.webm",
    type: "audio/webm",
    ok: false,
  },
  {
    name: "malformed percent filename",
    kind: "message",
    size: 1,
    file: "bad%ZZ.png",
    type: "image/png",
    ok: false,
  },
] as const)("native Bun parser and file policy: $name", async (item) => {
  const form = await readBoundedFormData(
    request(multipart(item.file, item.type, item.size)),
    10551296,
  );
  const result = validateMediaFile(form.get("file"), item.kind);
  expect(result.ok).toBe(item.ok);
  if (!result.ok && item.size > 10485760) expect(result.status).toBe(413);
});

test.each([undefined, "1"])(
  "native Bun stream cancels overflow with length %s",
  async (length) => {
    const bytes = multipart("clip.mp3", "audio/mpeg", 1024);
    let offset = 0;
    let cancelled = false;
    let cancelDone: () => void = () => {};
    const cancellation = new Promise<void>((resolve) => {
      cancelDone = resolve;
    });
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (offset >= bytes.length) return controller.close();
          controller.enqueue(bytes.slice(offset, offset + 16));
          offset += 16;
        },
        cancel() {
          cancelled = true;
          cancelDone();
        },
      },
      { highWaterMark: 0 },
    );
    await expect(
      readBoundedFormData(request(stream, length), 256),
    ).rejects.toMatchObject({ status: 413 });
    await cancellation;
    expect(cancelled).toBe(true);
    expect(offset).toBeLessThan(bytes.length);
  },
);

test("native Bun declared overflow rejects before pulling", async () => {
  let pulls = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull() {
        pulls++;
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  await expect(
    readBoundedFormData(request(stream, "1024"), 256),
  ).rejects.toMatchObject({ status: 413 });
  expect(pulls).toBe(0);
  expect(cancelled).toBe(true);
});
