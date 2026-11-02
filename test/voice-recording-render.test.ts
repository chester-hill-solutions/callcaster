import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { renderVoiceRecording, type VoiceRecordingRenderRange } from "../app/lib/voice-recording-render.server";

const RATE = 44100;

/** Real stereo PCM fixtures: no provider calls or mocked codec. */
function wave(durationMs: number, frequency: (ms: number, channel: number) => number) {
  const frames = Math.round(durationMs * RATE / 1000), header = Buffer.alloc(44), data = Buffer.alloc(frames * 4);
  header.write("RIFF"); header.writeUInt32LE(36 + data.length, 4); header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
  header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 4, 28); header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(data.length, 40);
  for (let frame = 0; frame < frames; frame++) for (let channel = 0; channel < 2; channel++) {
    const tone = frequency(frame * 1000 / RATE, channel);
    data.writeInt16LE(Math.round(15000 * Math.sin(2 * Math.PI * tone * frame / RATE)), frame * 4 + channel * 2);
  }
  return Buffer.concat([header, data]);
}

async function decode(buffer: Buffer) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "callcaster-render-test-")), file = path.join(directory, "recording.mp3");
  try {
    await writeFile(file, buffer);
    // Do not force channels or sample rate. The output must actually be mono 44.1 kHz.
    const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,channels,sample_rate", "-of", "json", file], { encoding: "utf8" }));
    expect(probe.streams).toEqual([expect.objectContaining({ codec_name: "mp3", channels: 1, sample_rate: "44100" })]);
    return execFileSync("ffmpeg", ["-v", "error", "-i", file, "-acodec", "pcm_s16le", "-f", "s16le", "pipe:1"]);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

function amplitude(pcm: Buffer, frequency: number, startMs: number, durationMs: number) {
  const start = Math.round(startMs * RATE / 1000), count = Math.round(durationMs * RATE / 1000);
  let real = 0, imaginary = 0;
  for (let frame = start; frame < start + count; frame++) {
    const sample = pcm.readInt16LE(frame * 2) / 32768, phase = 2 * Math.PI * frequency * frame / RATE;
    real += sample * Math.cos(phase); imaginary += sample * Math.sin(phase);
  }
  return 2 * Math.hypot(real, imaginary) / count;
}

describe("ordered customer recording renderer (real ffmpeg)", () => {
  test("orders physical parts, removes gaps, retains both speakers and maps original time", async () => {
    const before = wave(1000, (ms, channel) => ms >= 200 && ms < 500 ? channel ? 660 : 440 : 220);
    const after = wave(1000, (ms, channel) => ms >= 100 && ms < 500 ? channel ? 1320 : 880 : 1760);
    const pending = renderVoiceRecording({ sources: [{ id: "after", buffer: after }, { id: "before", buffer: before }], ranges: [
      { sourceId: "after", sourceStartMs: 100, sourceEndMs: 500, callStartMs: 2500 },
      { sourceId: "before", sourceStartMs: 200, sourceEndMs: 500, callStartMs: 1000 },
    ] });
    await expect(pending).resolves.toMatchObject({ sampleRate: 44100, sampleCount: 30870, timebase: "compact-v1" });
    const result = await pending;
    const pcm = await decode(result.buffer);
    expect(pcm.length / 2).toBe(30870); // 700 ms, not the 1900 ms elapsed call span.
    for (const frequency of [440, 660]) expect(amplitude(pcm, frequency, 50, 200)).toBeGreaterThan(0.15);
    for (const frequency of [880, 1320]) expect(amplitude(pcm, frequency, 350, 200)).toBeGreaterThan(0.15);
    expect(amplitude(pcm, 220, 50, 200)).toBeLessThan(0.02);
    expect(amplitude(pcm, 1760, 350, 200)).toBeLessThan(0.02);
    expect(amplitude(pcm, 880, 50, 200)).toBeLessThan(0.02);
    expect(amplitude(pcm, 440, 350, 200)).toBeLessThan(0.02);
    expect(result.timeline).toEqual([
      { sourceId: "before", sourceStartMs: 200, sourceEndMs: 500, callStartMs: 1000, callEndMs: 1300,
        sourceStartSample: 8820, sourceEndSample: 22050, playbackStartSample: 0, playbackEndSample: 13230 },
      { sourceId: "after", sourceStartMs: 100, sourceEndMs: 500, callStartMs: 2500, callEndMs: 2900,
        sourceStartSample: 4410, sourceEndSample: 22050, playbackStartSample: 13230, playbackEndSample: 30870 },
    ]);
  });

  test("retains intervals shorter than the library editor minimum", async () => {
    const pending = renderVoiceRecording({ sources: [{ id: "part", buffer: wave(1000, () => 440) }], ranges: [
      { sourceId: "part", sourceStartMs: 0, sourceEndMs: 25, callStartMs: 0 },
      { sourceId: "part", sourceStartMs: 125, sourceEndMs: 200, callStartMs: 125 },
    ] });
    await expect(pending).resolves.toMatchObject({ sampleCount: 4410 });
    const result = await pending;
    expect((await decode(result.buffer)).length / 2).toBe(4410);
  });

  test("keeps sample rounding bounded across many short slices", async () => {
    const ranges = Array.from({ length: 40 }, (_, index) => ({ sourceId: "part", sourceStartMs: index * 3, sourceEndMs: index * 3 + 1, callStartMs: index * 10 }));
    const pending = renderVoiceRecording({ sources: [{ id: "part", buffer: wave(200, () => 440) }], ranges });
    await expect(pending).resolves.toMatchObject({ sampleCount: 1764 });
    const result = await pending;
    const count = (await decode(result.buffer)).length / 2;
    expect(count).toBe(1764); // 40 ms at 44.1 kHz, no frame or encoder padding per slice.
    expect(result.timeline.at(-1)?.playbackEndSample).toBe(count);
  });

  test("keeps source identity and order when the caller changes descriptors during staging", async () => {
    const sources = [{ id: "first", buffer: wave(200, () => 440) }, { id: "second", buffer: wave(200, () => 880) }];
    const pending = renderVoiceRecording({ sources, ranges: [
      { sourceId: "first", sourceStartMs: 0, sourceEndMs: 200, callStartMs: 0 },
      { sourceId: "second", sourceStartMs: 0, sourceEndMs: 200, callStartMs: 200 },
    ] });
    sources.reverse(); sources[0].id = "changed";
    await expect(pending).resolves.toMatchObject({ sampleCount: 17640 });
    const result = await pending, pcm = await decode(result.buffer);
    expect(amplitude(pcm, 440, 50, 100)).toBeGreaterThan(0.3);
    expect(amplitude(pcm, 880, 250, 100)).toBeGreaterThan(0.3);
    expect(result.timeline.map(range => range.sourceId)).toEqual(["first", "second"]);
  });

  test("rejects a range beyond available audio instead of publishing a short result", async () => {
    await expect(renderVoiceRecording({ sources: [{ id: "part", buffer: wave(100, () => 440) }], ranges: [
      { sourceId: "part", sourceStartMs: 50, sourceEndMs: 200, callStartMs: 0 },
    ] })).rejects.toThrow("incomplete rendered media");
  });

  test("rejects corrupt physical bytes", async () => {
    await expect(renderVoiceRecording({ sources: [{ id: "part", buffer: Buffer.from("not audio") }], ranges: [
      { sourceId: "part", sourceStartMs: 0, sourceEndMs: 100, callStartMs: 0 },
    ] })).rejects.toThrow("Recording assembly failed");
  });

  test.each([
    { sourceId: "part", sourceStartMs: -1, sourceEndMs: 100, callStartMs: 0 },
    { sourceId: "part", sourceStartMs: 1.5, sourceEndMs: 100, callStartMs: 0 },
    { sourceId: "part", sourceStartMs: 100, sourceEndMs: 100, callStartMs: 0 },
    { sourceId: "missing", sourceStartMs: 0, sourceEndMs: 100, callStartMs: 0 },
    { sourceId: "part", sourceStartMs: 0, sourceEndMs: 100, callStartMs: Number.MAX_SAFE_INTEGER },
  ])("rejects invalid interval $sourceStartMs/$sourceEndMs/$sourceId/$callStartMs", async range => {
    await expect(renderVoiceRecording({ sources: [{ id: "part", buffer: Buffer.from("not reached") }], ranges: [range] })).rejects.toThrow("Recording assembly has");
  });

  test("refuses overlapping conversation intervals until the manifest selects one source", async () => {
    const ranges: VoiceRecordingRenderRange[] = [
      { sourceId: "first", sourceStartMs: 0, sourceEndMs: 100, callStartMs: 0 },
      { sourceId: "second", sourceStartMs: 0, sourceEndMs: 100, callStartMs: 50 },
    ];
    await expect(renderVoiceRecording({ sources: [{ id: "first", buffer: wave(100, () => 440) }, { id: "second", buffer: wave(100, () => 880) }], ranges })).rejects.toThrow("overlapping");
  });

  test.each(["duplicate", "empty", "unselected"])("refuses %s physical media", async kind => {
    const sources = [{ id: "part", buffer: Buffer.from("a") }, { id: kind === "duplicate" ? "part" : "extra", buffer: kind === "empty" ? Buffer.alloc(0) : Buffer.from("b") }];
    await expect(renderVoiceRecording({ sources, ranges: [{ sourceId: "part", sourceStartMs: 0, sourceEndMs: 100, callStartMs: 0 }] })).rejects.toThrow("Recording assembly has");
  });
});
