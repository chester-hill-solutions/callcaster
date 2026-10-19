import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AUDIO_PROCESS_TIMEOUT_MS } from "../app/lib/audio-process.server";

function createSpawnMock() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: EventEmitter & { end: ReturnType<typeof vi.fn> };
    kill: ReturnType<typeof vi.fn>;
    killed: boolean;
  };

  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = Object.assign(new EventEmitter(), { end: vi.fn() });
  proc.killed = false;
  proc.kill = vi.fn(() => {
    proc.killed = true;
    return true;
  });

  return proc;
}

function mockFs(rm: ReturnType<typeof vi.fn> = vi.fn(async () => undefined)) {
  vi.doMock("node:fs/promises", () => ({
    rm,
    writeFile: vi.fn(async () => undefined),
  }));
  return rm;
}

function mockSpawn() {
  const proc = createSpawnMock();
  const spawn = vi.fn(() => proc);
  vi.doMock("node:child_process", () => ({ spawn }));
  return { proc, spawn };
}

const MESSAGES = { unavailable: "unavailable", failed: "conversion failed" };

describe("app/lib/audio-process.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("resolves with stdout and kills the child when the scope closes", async () => {
    const { proc, spawn } = mockSpawn();
    mockFs();

    const mod = await import("../app/lib/audio-process.server");
    const pending = mod.runAudioProcess({
      command: "ffmpeg",
      buildArgs: () => ["-i", "pipe:0", "pipe:1"],
      inputBuffer: Buffer.from("in"),
      messages: MESSAGES,
    });

    await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
    proc.stdout.emit("data", Buffer.from("out"));
    proc.emit("close", 0);

    await expect(pending).resolves.toEqual(Buffer.from("out"));
    expect(proc.kill).toHaveBeenCalledWith("SIGKILL");
  });

  test("stages seekable input and removes that exact file on success", async () => {
    const rm = mockFs();
    const { proc, spawn } = mockSpawn();

    const mod = await import("../app/lib/audio-process.server");
    const pending = mod.runAudioProcess({
      command: "ffmpeg",
      buildArgs: (inputTarget) => ["-i", inputTarget, "pipe:1"],
      inputBuffer: Buffer.from("in"),
      messages: MESSAGES,
      stage: { prefix: "callcaster-test" },
    });

    await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
    proc.emit("close", 0);

    await expect(pending).resolves.toEqual(Buffer.alloc(0));
    const staged = (spawn.mock.calls[0][1] as string[])[1];
    expect(staged).toMatch(/callcaster-test-.*\.mp3$/);
    expect(proc.stdin.end).toHaveBeenCalledWith(Buffer.alloc(0));
    expect(rm).toHaveBeenCalledTimes(1);
    expect(rm).toHaveBeenCalledWith(staged, { force: true });
  });

  test("deadline kills a wedged child and fails the conversion", async () => {
    vi.useFakeTimers();
    const { proc, spawn } = mockSpawn();
    mockFs();

    const mod = await import("../app/lib/audio-process.server");
    const pending = mod
      .runAudioProcess({
        command: "ffmpeg",
        buildArgs: () => ["pipe:1"],
        inputBuffer: Buffer.alloc(0),
        messages: MESSAGES,
      })
      .catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(0);
    expect(spawn).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(AUDIO_PROCESS_TIMEOUT_MS + 1000);

    await expect(pending).resolves.toMatchObject({
      message: "conversion failed (timed out).",
      status: 500,
    });
    expect(proc.kill).toHaveBeenCalledWith("SIGKILL");
  });

  test("cancelling the signal kills the child and removes its staged file", async () => {
    const rm = mockFs();
    const { proc, spawn } = mockSpawn();

    const mod = await import("../app/lib/audio-process.server");
    const controller = new AbortController();
    const pending = mod
      .runAudioProcess({
        command: "ffmpeg",
        buildArgs: (inputTarget) => ["-i", inputTarget, "pipe:1"],
        inputBuffer: Buffer.from("in"),
        messages: MESSAGES,
        stage: { prefix: "callcaster-test" },
        signal: controller.signal,
      })
      .catch((error: unknown) => error);

    await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
    controller.abort();
    await pending;

    expect(proc.kill).toHaveBeenCalledWith("SIGKILL");
    expect(rm).toHaveBeenCalledTimes(1);
  });
});
