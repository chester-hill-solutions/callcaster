import type { TwilioMediaPayload } from "./types";

const SAMPLES_PER_MS = 8;
const WINDOW_SAMPLES = 10_000 * SAMPLES_PER_MS;
const JITTER_MS = 200;
const OUTPUT_SAMPLES = 800;
const SILENCE = 0xff;

type Track = { samples: Uint8Array; present: Uint8Array };

function decode(sample: number) {
  const value = ~sample & 0xff;
  const magnitude = (((value & 15) << 3) + 132) << ((value >> 4) & 7);
  return value & 128 ? 132 - magnitude : magnitude - 132;
}

function encode(sample: number) {
  const sign = sample < 0 ? 128 : 0;
  const magnitude = Math.min(32635, Math.abs(sample)) + 132;
  let exponent = 7;
  for (let mask = 0x4000; exponent > 0 && !(magnitude & mask); mask >>= 1) exponent--;
  return ~(sign | exponent << 4 | (magnitude >> (exponent + 3) & 15)) & 0xff;
}

/**
 * Twilio timestamps address one 8kHz clock, even when both tracks are present.
 * Mix G.711 samples in linear PCM; concatenating tracks doubles elapsed audio.
 * The fixed ten-second window also bounds startup buffering and invalid jumps.
 */
export class TwilioAudioTimeline {
  private tracks = new Map<string, Track>();
  private cursor = 0;
  private end = 0;
  private output: ((audio: Buffer) => void) | null = null;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(tracks: readonly string[], private onError: () => void) {
    if (!Array.isArray(tracks) || tracks.length < 1 || tracks.length > 2 ||
        new Set(tracks).size !== tracks.length || tracks.some(track => track !== "inbound" && track !== "outbound"))
      throw new Error("Invalid Twilio audio tracks");
    for (const track of tracks) this.tracks.set(track, {
      samples: new Uint8Array(WINDOW_SAMPLES), present: new Uint8Array(WINDOW_SAMPLES),
    });
  }

  /** Retain bounded audio during STT open, then attach its one output owner. */
  connect(output: (audio: Buffer) => void) {
    if (this.closed) return;
    if (this.output) throw new Error("Twilio audio output is already connected");
    this.output = output;
    this.drainReady();
    this.schedule();
  }

  push(media: Pick<TwilioMediaPayload, "track" | "timestamp" | "payload">) {
    if (this.closed) return;
    const track = this.tracks.get(media?.track);
    if (!track || typeof media.timestamp !== "string" || !/^\d+$/.test(media.timestamp) ||
        typeof media.payload !== "string" || media.payload.length > Math.ceil(WINDOW_SAMPLES / 3) * 4)
      throw new Error("Invalid Twilio audio frame");
    const start = Number(media.timestamp) * SAMPLES_PER_MS;
    const audio = Buffer.from(media.payload, "base64");
    const end = start + audio.length;
    if (!Number.isSafeInteger(end) || end < 0 || audio.length > WINDOW_SAMPLES ||
        audio.toString("base64") !== media.payload || end - this.cursor > WINDOW_SAMPLES)
      throw new Error("Twilio audio exceeds its timeline window");
    if (!audio.length || end <= this.cursor) return;
    for (const [offset, value] of audio.entries()) {
      const sample = start + offset;
      if (sample < this.cursor) continue;
      const index = sample % WINDOW_SAMPLES;
      if (!track.present[index]) {
        track.samples[index] = value;
        track.present[index] = 1;
      }
    }
    this.end = Math.max(this.end, end);
    this.drainReady();
    this.schedule();
  }

  /** The owner flushes before closing its STT connection. */
  flush() {
    this.clearDeadline();
    if (!this.closed && this.output) this.drain(this.end);
  }

  close() {
    this.closed = true;
    this.clearDeadline();
    this.output = null;
    this.tracks.clear();
  }

  private drainReady() {
    if (!this.output) return;
    let through = this.cursor;
    while (through < this.end) {
      let present = 0;
      for (const track of this.tracks.values()) if (track.present[through % WINDOW_SAMPLES]) present++;
      if (present !== this.tracks.size) break;
      through++;
    }
    this.drain(through);
  }

  private drain(through: number) {
    while (this.cursor < through) {
      const audio = Buffer.alloc(Math.min(OUTPUT_SAMPLES, through - this.cursor), SILENCE);
      for (let offset = 0; offset < audio.length; offset++) {
        const index = (this.cursor + offset) % WINDOW_SAMPLES;
        let count = 0, sum = 0, original = SILENCE;
        for (const track of this.tracks.values()) {
          if (!track.present[index]) continue;
          const value = track.samples[index];
          if (value === undefined) throw new Error("Twilio audio sample is outside its window");
          original = value;
          sum += decode(original);
          count++;
          track.present[index] = 0;
        }
        audio[offset] = count > 1 ? encode(sum) : original;
      }
      this.cursor += audio.length;
      this.output?.(audio);
    }
  }

  private schedule() {
    if (this.cursor >= this.end) this.clearDeadline();
    if (this.closed || !this.output || this.deadline || this.cursor >= this.end) return;
    // Keep the oldest deadline. Continuous traffic on one track cannot starve it.
    // Newer audio gets its own deadline rather than losing its full jitter window.
    const through = this.end;
    this.deadline = setTimeout(() => {
      this.deadline = null;
      if (this.closed) return;
      try { this.drain(through); this.drainReady(); this.schedule(); }
      catch { this.close(); this.onError(); }
    }, JITTER_MS);
    this.deadline.unref?.();
  }

  private clearDeadline() {
    if (this.deadline) clearTimeout(this.deadline);
    this.deadline = null;
  }
}
