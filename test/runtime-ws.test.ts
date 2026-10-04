import { once, type EventEmitter } from "node:events";
import { afterEach, describe, expect, test } from "vitest";
import { Receiver, WebSocket, WebSocketServer } from "ws";

const receivers: Receiver[] = [];

function event(target: EventEmitter, name: string) {
  return once(target, name, { signal: AbortSignal.timeout(3000) });
}

function receiver(options: {
  maxFragments?: number;
  maxBufferedChunks?: number;
}) {
  const stream = new Receiver({ maxPayload: 1024, ...options });
  // Rejections are checked through the write callback; retain the stream error listener.
  stream.on("error", () => {});
  receivers.push(stream);
  return stream;
}

function write(stream: Receiver, chunk: Buffer) {
  return new Promise<void>((resolve, reject) => {
    stream.write(chunk, (error) => (error ? reject(error) : resolve()));
  });
}

afterEach(async () => {
  await Promise.all(
    receivers.splice(0).map(async (stream) => {
      if (stream.closed) return;
      const closed = new Promise<void>((resolve) =>
        stream.once("close", resolve),
      );
      stream.destroy();
      await closed;
      expect(stream.destroyed).toBe(true);
    }),
  );
});

describe("runtime ws structural limits", () => {
  test("rejects a third tiny fragment at a two-fragment limit", async () => {
    const stream = receiver({ maxFragments: 2 });
    const messages: Buffer[] = [];
    stream.on("message", (message) => messages.push(message));
    await write(stream, Buffer.from([0x02, 1, 65]));
    await write(stream, Buffer.from([0x00, 1, 66]));
    await expect(
      write(stream, Buffer.from([0x80, 1, 67])),
    ).rejects.toMatchObject({
      code: "WS_ERR_TOO_MANY_BUFFERED_PARTS",
    });
    expect(messages).toEqual([]);
  });

  test("accepts exactly two fragments and resets the count for another message", async () => {
    const stream = receiver({ maxFragments: 2 });
    const messages: Buffer[] = [];
    stream.on("message", (message) => messages.push(message));
    await write(stream, Buffer.from([0x02, 1, 65]));
    await write(stream, Buffer.from([0x80, 1, 66]));
    await write(stream, Buffer.from([0x02, 1, 67]));
    await write(stream, Buffer.from([0x80, 1, 68]));
    expect(messages).toEqual([Buffer.from("AB"), Buffer.from("CD")]);
  });

  test("rejects a third buffered chunk before the declared payload arrives", async () => {
    const stream = receiver({ maxBufferedChunks: 2 });
    const messages: Buffer[] = [];
    stream.on("message", (message) => messages.push(message));
    await write(stream, Buffer.from([0x82, 4]));
    await write(stream, Buffer.from("A"));
    await write(stream, Buffer.from("B"));
    await expect(write(stream, Buffer.from("C"))).rejects.toMatchObject({
      code: "WS_ERR_TOO_MANY_BUFFERED_PARTS",
    });
    expect(messages).toEqual([]);
  });

  test("accepts two buffered chunks and resets the count for another frame", async () => {
    const stream = receiver({ maxBufferedChunks: 2 });
    const messages: Buffer[] = [];
    stream.on("message", (message) => messages.push(message));
    for (const pair of [
      ["AB", "CD"],
      ["EF", "GH"],
    ]) {
      await write(stream, Buffer.from([0x82, 4]));
      await write(stream, Buffer.from(pair[0]));
      await write(stream, Buffer.from(pair[1]));
    }
    expect(messages).toEqual([Buffer.from("ABCD"), Buffer.from("EFGH")]);
  });

  test("keeps text decoding with a UTF-8 character split across fragments", async () => {
    const stream = receiver({ maxFragments: 2 });
    const messages: { text: string; binary: boolean }[] = [];
    stream.on("message", (message, binary) =>
      messages.push({ text: message.toString(), binary }),
    );
    await write(stream, Buffer.from([0x01, 2, 0x63, 0xc3]));
    await write(stream, Buffer.from([0x80, 1, 0xa9]));
    expect(messages).toEqual([{ text: "cé", binary: false }]);
  });
});

describe("runtime ws local transport compatibility", () => {
  async function connection(maxFragments?: number) {
    const server = new WebSocketServer({
      host: "127.0.0.1",
      port: 0,
      ...(maxFragments === undefined ? {} : { maxFragments }),
    });
    await event(server, "listening");
    const address = server.address();
    if (typeof address === "string" || !address)
      throw new Error("Missing local ws address");
    const connected = event(server, "connection");
    const client = new WebSocket(
      `ws://127.0.0.1:${address.port}`,
      "fixture.v1",
    );
    await event(client, "open");
    const [peer] = await connected;
    if (!(peer instanceof WebSocket)) throw new Error("Missing local ws peer");
    return { server, client, peer };
  }

  async function close(fixture: Awaited<ReturnType<typeof connection>>) {
    const closed = [fixture.client, fixture.peer].map((socket) =>
      socket.readyState === WebSocket.CLOSED
        ? Promise.resolve()
        : new Promise<void>((resolve) => socket.once("close", resolve)),
    );
    fixture.client.terminate();
    fixture.peer.terminate();
    await Promise.all(closed);
    await new Promise<void>((resolve, reject) =>
      fixture.server.close((error) => (error ? reject(error) : resolve())),
    );
    expect(fixture.server.clients.size).toBe(0);
  }

  test("retains subprotocol, text, binary and ping/pong exchanges", async () => {
    const fixture = await connection();
    try {
      expect(fixture.client.protocol).toBe("fixture.v1");
      expect(fixture.peer.protocol).toBe("fixture.v1");
      const text = event(fixture.peer, "message");
      fixture.client.send("Hello café");
      const [message, binary] = await text;
      expect(message.toString()).toBe("Hello café");
      expect(binary).toBe(false);
      const bytes = event(fixture.client, "message");
      fixture.peer.send(Buffer.from([0, 127, 255]));
      expect(await bytes).toEqual([Buffer.from([0, 127, 255]), true]);
      const pong = event(fixture.client, "pong");
      fixture.client.ping("check");
      expect((await pong)[0]).toEqual(Buffer.from("check"));
    } finally {
      await close(fixture);
    }
  });

  test("rejects a wide typed-array close reason before sending unsafe bytes", async () => {
    const fixture = await connection();
    try {
      expect(() => fixture.peer.close(1000, new Float32Array(20))).toThrow(
        "Second argument must be a string or a Uint8Array",
      );
    } finally {
      await close(fixture);
    }
  });

  test("sends every byte of a supported Uint8Array close reason", async () => {
    const fixture = await connection();
    try {
      const closed = event(fixture.client, "close");
      fixture.peer.close(1000, new Uint8Array(80).fill(65));
      const [code, reason] = await closed;
      expect(code).toBe(1000);
      expect(reason).toEqual(Buffer.alloc(80, 65));
    } finally {
      await close(fixture);
    }
  });

  test("server fragment limit closes an excess fragmented message with code 1008", async () => {
    const fixture = await connection(2);
    try {
      const errors: Error[] = [];
      const messages: Buffer[] = [];
      fixture.peer.on("error", (error) => errors.push(error));
      fixture.peer.on("message", (message) => messages.push(message));
      const closed = event(fixture.client, "close");
      fixture.client.send("A", { fin: false });
      fixture.client.send("B", { fin: false });
      fixture.client.send("C", { fin: true });
      expect((await closed)[0]).toBe(1008);
      expect(errors).toMatchObject([
        { code: "WS_ERR_TOO_MANY_BUFFERED_PARTS" },
      ]);
      expect(messages).toEqual([]);
    } finally {
      await close(fixture);
    }
  });

  test("server fragment limit accepts a valid two-fragment message", async () => {
    const fixture = await connection(2);
    try {
      const message = event(fixture.peer, "message");
      fixture.client.send("A", { fin: false });
      fixture.client.send("B", { fin: true });
      const [data, binary] = await message;
      expect(data.toString()).toBe("AB");
      expect(binary).toBe(false);
    } finally {
      await close(fixture);
    }
  });
});
