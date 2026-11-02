import { runAudioProcess } from "@/lib/audio-process.server";
import { AudioUploadError, MP3_ENCODE_ARGS, NORMALIZED_AUDIO_SAMPLE_RATE } from "@/lib/audio.server";
import { z } from "zod";

export type VoiceRecordingRenderSource = { id: string; buffer: Buffer };
/** Preselected customer intervals. Membership and complete history belong to the manifest owner. */
export type VoiceRecordingRenderRange = { sourceId: string; sourceStartMs: number; sourceEndMs: number; callStartMs: number };
export type VoiceRecordingTimeMap = VoiceRecordingRenderRange & {
  callEndMs: number;
  sourceStartSample: number;
  sourceEndSample: number;
  playbackStartSample: number;
  playbackEndSample: number;
};

const SAMPLE_RATE = NORMALIZED_AUDIO_SAMPLE_RATE;
const MESSAGES = { unavailable: "Recording assembly is unavailable", failed: "Recording assembly failed" };
const decodedAudio = z.object({
  streams: z.array(z.object({ codec_name: z.literal("mp3"), channels: z.literal(1), sample_rate: z.literal("44100") })).length(1),
  frames: z.array(z.object({ nb_samples: z.number().int().positive() })).min(1),
});

function invalid(reason: string): never {
  throw new AudioUploadError(`Recording assembly has ${reason}.`, 500);
}

function prepareRanges(sources: readonly VoiceRecordingRenderSource[], ranges: readonly VoiceRecordingRenderRange[]) {
  if (!sources.length || sources.length > 64 || !ranges.length || ranges.length > 1000) invalid("an invalid part count");
  const sourceIds = new Set(sources.map(source => source.id));
  if (sourceIds.size !== sources.length || sources.some(source => !source.id || !source.buffer.length)) invalid("missing or duplicate media");
  const used = new Set<string>(), timeline: VoiceRecordingTimeMap[] = [];
  let playbackSample = 0, previousCallEnd = 0;
  for (const range of [...ranges].sort((a, b) => a.callStartMs - b.callStartMs)) {
    if (![range.sourceStartMs, range.sourceEndMs, range.callStartMs].every(value => Number.isSafeInteger(value) && value >= 0) ||
        range.sourceEndMs <= range.sourceStartMs || !sourceIds.has(range.sourceId)) invalid("an invalid source interval");
    const start = Math.round(range.sourceStartMs * SAMPLE_RATE / 1000), end = Math.round(range.sourceEndMs * SAMPLE_RATE / 1000);
    const callEndMs = range.callStartMs + range.sourceEndMs - range.sourceStartMs;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || !Number.isSafeInteger(callEndMs) ||
        range.callStartMs < previousCallEnd) invalid("overlapping or invalid call intervals");
    const playbackEndSample = playbackSample + end - start;
    if (!Number.isSafeInteger(playbackEndSample)) invalid("an invalid playback duration");
    timeline.push({ ...range, callEndMs, sourceStartSample: start, sourceEndSample: end,
      playbackStartSample: playbackSample, playbackEndSample });
    used.add(range.sourceId); previousCallEnd = callEndMs; playbackSample = playbackEndSample;
  }
  if (used.size !== sourceIds.size) invalid("unselected media");
  return { timeline, sampleCount: playbackSample };
}

function assemblyFilter(sources: readonly VoiceRecordingRenderSource[], timeline: VoiceRecordingTimeMap[]) {
  const filters: string[] = [];
  sources.forEach((source, sourceIndex) => {
    const clips = timeline.map((range, index) => ({ range, index })).filter(clip => clip.range.sourceId === source.id);
    const labels = clips.map(clip => `[source${clip.index}]`).join("");
    filters.push(`[${sourceIndex}:a:0]aresample=${SAMPLE_RATE},aformat=sample_fmts=fltp:channel_layouts=mono` +
      (clips.length > 1 ? `,asplit=${clips.length}` : "") + labels);
    for (const { range, index } of clips) filters.push(`[source${index}]atrim=start_sample=${range.sourceStartSample}:end_sample=${range.sourceEndSample},asetpts=PTS-STARTPTS[clip${index}]`);
  });
  const clips = timeline.map((_, index) => `[clip${index}]`).join("");
  filters.push(`${clips}${timeline.length > 1 ? `concat=n=${timeline.length}:v=0:a=1` : "anull"}[assembled]`);
  return filters.join(";");
}

/** Render bytes and provenance only. This does not acknowledge or publish a whole call. */
export async function renderVoiceRecording(args: {
  sources: readonly VoiceRecordingRenderSource[];
  ranges: readonly VoiceRecordingRenderRange[];
  signal?: AbortSignal;
}) {
  const sources = args.sources.map(source => ({ id: source.id, buffer: source.buffer }));
  const { timeline, sampleCount } = prepareRanges(sources, args.ranges);
  const buffer = await runAudioProcess({ command: "ffmpeg", inputBuffers: sources.map(source => source.buffer),
    stage: { prefix: "callcaster-recording-source" }, stageOutput: { prefix: "callcaster-recording-assembly" },
    messages: MESSAGES, signal: args.signal,
    buildArgs: (inputs, output) => ["-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      ...inputs.flatMap(input => ["-i", input]), "-filter_complex", assemblyFilter(sources, timeline),
      "-map", "[assembled]", "-map_metadata", "-1", "-map_chapters", "-1", ...MP3_ENCODE_ARGS, output],
  });
  // A seekable MP3 retains encoder delay/padding. Verify decoded samples, not
  // container duration: ffmpeg can exit zero after silently clipping past EOF.
  const decoded = await runAudioProcess({ command: "ffprobe", inputBuffer: buffer,
    stage: { prefix: "callcaster-recording-verify" }, messages: MESSAGES, signal: args.signal,
    buildArgs: input => ["-v", "error", "-select_streams", "a:0", "-show_entries",
      "stream=codec_name,channels,sample_rate:frame=nb_samples", "-of", "json", input],
  });
  const metadata = decodedAudio.parse(JSON.parse(decoded.toString("utf8")));
  // Count decoded frames without retaining an entire uncompressed call in memory.
  if (!buffer.length || metadata.frames.reduce((total, frame) => total + frame.nb_samples, 0) !== sampleCount) invalid("incomplete rendered media");
  return { buffer, sampleRate: SAMPLE_RATE, sampleCount, timeline, timebase: "compact-v1" as const };
}
