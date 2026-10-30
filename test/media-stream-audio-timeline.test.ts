import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { TwilioAudioTimeline } from "../services/media-stream/audio-timeline";

const owned: TwilioAudioTimeline[] = [];
function fixture(tracks = ["inbound", "outbound"]) {
  const audio: Buffer[] = [], onError = vi.fn();
  const timeline = new TwilioAudioTimeline(tracks, onError);
  owned.push(timeline);
  const connect = () => timeline.connect(chunk => audio.push(chunk));
  const push = (track: string, timestamp: string, length: number, sample: number) =>
    timeline.push({ track, timestamp, payload: Buffer.alloc(length, sample).toString("base64") });
  return { timeline, audio, onError, connect, push, output: () => Buffer.concat(audio) };
}

describe("Twilio mono audio timeline", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    for (const timeline of owned.splice(0)) timeline.close();
    vi.useRealTimers();
  });

  // Fixed G.711 vectors: 0x90=+15996, 0x10=-15996, 0xaf=+4092,
  // 0x80=+32124, 0x00=-32124, 0xff=0. These do not use the mixer codec.
  test.each([
    { inbound: 0x90, outbound: 0x10, mixed: 0xff },
    { inbound: 0x90, outbound: 0xff, mixed: 0x90 },
    { inbound: 0xff, outbound: 0xaf, mixed: 0xaf },
    { inbound: 0xaf, outbound: 0xaf, mixed: 0x9f },
    { inbound: 0x80, outbound: 0x80, mixed: 0x80 },
    { inbound: 0x00, outbound: 0x00, mixed: 0x00 },
  ])("mixes linear samples and saturates: $inbound / $outbound", ({ inbound, outbound, mixed }) => {
    const f = fixture(); f.connect();
    f.push("inbound", "0", 160, inbound);
    expect(f.output()).toHaveLength(0);
    f.push("outbound", "0", 160, outbound);
    expect(f.output()).toEqual(Buffer.alloc(160, mixed));
    expect(vi.getTimerCount()).toBe(0);
  });

  test("matches unequal packets by timestamp, in either arrival order", () => {
    for (const inboundFirst of [true, false]) {
      const f = fixture(); f.connect();
      if (inboundFirst) f.push("inbound", "0", 160, 0x90);
      f.push("outbound", "0", 80, 0x10);
      f.push("outbound", "10", 80, 0xff);
      if (!inboundFirst) f.push("inbound", "0", 160, 0x90);
      expect(f.output()).toEqual(Buffer.concat([Buffer.alloc(80, 0xff), Buffer.alloc(80, 0x90)]));
    }
  });

  test("a missing track cannot stop the other speaker or reset its oldest deadline", () => {
    const f = fixture(); f.connect();
    f.push("outbound", "0", 160, 0xaf);
    vi.advanceTimersByTime(150);
    f.push("outbound", "20", 160, 0x90);
    vi.advanceTimersByTime(49);
    expect(f.output()).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(f.output()).toEqual(Buffer.alloc(160, 0xaf));
    vi.advanceTimersByTime(200);
    expect(f.output()).toEqual(Buffer.concat([Buffer.alloc(160, 0xaf), Buffer.alloc(160, 0x90)]));
    expect(vi.getTimerCount()).toBe(0);
  });

  test("reordered packets retain their slot until the jitter deadline", () => {
    const f = fixture(); f.connect();
    f.push("inbound", "20", 160, 0x90);
    f.push("outbound", "0", 320, 0xff);
    expect(f.output()).toHaveLength(0);
    vi.advanceTimersByTime(100);
    f.push("inbound", "0", 160, 0xaf);
    expect(f.output()).toEqual(Buffer.concat([Buffer.alloc(160, 0xaf), Buffer.alloc(160, 0x90)]));
    expect(vi.getTimerCount()).toBe(0);
  });

  test("preserves initial and intermediate silence rather than compressing time", () => {
    const f = fixture(["inbound"]); f.connect();
    f.push("inbound", "5", 160, 0x90);
    f.push("inbound", "45", 160, 0xaf);
    f.timeline.flush();
    expect(f.output()).toEqual(Buffer.concat([
      Buffer.alloc(40, 0xff), Buffer.alloc(160, 0x90), Buffer.alloc(160, 0xff), Buffer.alloc(160, 0xaf),
    ]));
  });

  test("duplicates and already emitted frames cannot replay or replace samples", () => {
    const f = fixture(); f.connect();
    f.push("inbound", "0", 160, 0x90);
    f.push("inbound", "0", 160, 0x80);
    f.push("outbound", "0", 160, 0xff);
    f.push("inbound", "0", 160, 0x00);
    f.push("outbound", "0", 160, 0x00);
    f.push("inbound", "10", 160, 0xaf);
    f.push("outbound", "20", 80, 0xff);
    expect(f.output()).toEqual(Buffer.concat([Buffer.alloc(160, 0x90), Buffer.alloc(80, 0xaf)]));
  });

  test("buffers during upstream open without emitting or starting a deadline", () => {
    const f = fixture();
    f.push("inbound", "0", 160, 0x90); f.push("outbound", "0", 160, 0xff);
    vi.advanceTimersByTime(1000);
    expect(f.output()).toHaveLength(0); expect(vi.getTimerCount()).toBe(0);
    f.connect();
    expect(f.output()).toEqual(Buffer.alloc(160, 0x90));
  });

  test("close during upstream open discards buffers and refuses a late connection", () => {
    const f = fixture(); f.push("inbound", "0", 160, 0x90);
    f.timeline.close(); f.connect(); f.timeline.flush();
    vi.advanceTimersByTime(1000);
    expect(f.output()).toHaveLength(0); expect(vi.getTimerCount()).toBe(0);
  });

  test("flush sends each pending sample once and close cancels the timer", () => {
    const f = fixture(); f.connect(); f.push("inbound", "0", 160, 0x90);
    f.timeline.flush(); f.timeline.flush(); f.timeline.close();
    vi.advanceTimersByTime(1000); f.push("outbound", "0", 160, 0x10);
    expect(f.output()).toEqual(Buffer.alloc(160, 0x90)); expect(vi.getTimerCount()).toBe(0);
  });

  test("timer output failure releases the buffer and reports once", () => {
    const f = fixture(); f.timeline.connect(() => { throw new Error("Owned send failure"); });
    f.push("inbound", "0", 160, 0x90); vi.advanceTimersByTime(1000);
    expect(f.onError).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
    f.push("inbound", "20", 160, 0x90); vi.advanceTimersByTime(1000);
    expect(f.onError).toHaveBeenCalledTimes(1);
  });

  test.each(["-1", "0.5", "NaN", "Infinity", "9007199254740991"])("rejects invalid timestamp %s before output", timestamp => {
    const f = fixture(["inbound"]); f.connect();
    expect(() => f.push("inbound", timestamp, 160, 0x90)).toThrow();
    expect(f.output()).toHaveLength(0);
    f.push("inbound", "0", 160, 0xaf); expect(f.output()).toEqual(Buffer.alloc(160, 0xaf));
  });

  test("bounds a packet and future gap to ten seconds, but permits normal ring reuse", () => {
    const f = fixture(["inbound"]); f.connect();
    expect(() => f.push("inbound", "10001", 1, 0x90)).toThrow();
    expect(() => f.push("inbound", "0", 80001, 0x90)).toThrow();
    f.push("inbound", "0", 80000, 0xaf);
    f.push("inbound", "10000", 160, 0x90);
    expect(f.output()).toEqual(Buffer.concat([Buffer.alloc(80000, 0xaf), Buffer.alloc(160, 0x90)]));
    expect(f.audio.every(chunk => chunk.length <= 800)).toBe(true);
  });

  test("rejects an undeclared track and malformed base64 without hiding valid audio", () => {
    const f = fixture(["inbound"]); f.connect();
    expect(() => f.push("outbound", "0", 160, 0x90)).toThrow();
    expect(() => f.timeline.push({ track: "inbound", timestamp: "0", payload: "!!!!" })).toThrow();
    f.push("inbound", "0", 160, 0xaf); expect(f.output()).toEqual(Buffer.alloc(160, 0xaf));
  });

  test.each([{ tracks: [] }, { tracks: ["inbound", "inbound"] }, { tracks: ["other"] }])("refuses invalid expected tracks $tracks", ({ tracks }) => {
    expect(() => new TwilioAudioTimeline(tracks, vi.fn())).toThrow();
  });
});
