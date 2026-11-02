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

function mockFs(rm: ReturnType<typeof vi.fn> = vi.fn(async () => undefined), overrides = {}) {
  vi.doMock("node:fs/promises", async (importOriginal) => ({
    ...await importOriginal<typeof import("node:fs/promises")>(),
    rm,
    writeFile: vi.fn(async () => undefined),
    ...overrides,
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

  test("reads a seekable output before removing all input and output files", async () => {
    const rm = vi.fn(async () => undefined), readFile = vi.fn(async () => Buffer.from("encoded"));
    mockFs(rm, { readFile });
    const { proc, spawn } = mockSpawn();
    const mod = await import("../app/lib/audio-process.server");
    const pending = mod.runAudioProcess({ command: "ffmpeg", inputBuffers: [Buffer.from("first"), Buffer.from("second")],
      stage: { prefix: "callcaster-input" }, stageOutput: { prefix: "callcaster-output" }, messages: MESSAGES,
      buildArgs: (inputs, output) => [...inputs.flatMap(input => ["-i", input]), output],
    });
    await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
    proc.stdout.emit("data", Buffer.from("not the output file"));
    proc.emit("close", 0);
    await expect(pending).resolves.toEqual(Buffer.from("encoded"));
    const paths = (spawn.mock.calls[0][1] as string[]).filter(arg => arg !== "-i");
    expect(new Set(paths).size).toBe(3);
    expect(readFile).toHaveBeenCalledWith(paths[2]);
    expect(rm.mock.calls.map(call => call[0]).sort()).toEqual([...paths].sort());
    expect(proc.stdin.end).toHaveBeenCalledWith(Buffer.alloc(0));
    expect(proc.kill).toHaveBeenCalledWith("SIGKILL");
  });

  test("removes partial second input and reserved output if staging fails", async () => {
    const rm = vi.fn(async () => undefined), writeFile = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("disk full"));
    mockFs(rm, { writeFile });
    const { spawn } = mockSpawn();
    const mod = await import("../app/lib/audio-process.server");
    await expect(mod.runAudioProcess({ command: "ffmpeg", inputBuffers: [Buffer.from("first"), Buffer.from("second")],
      stage: { prefix: "callcaster-input" }, stageOutput: { prefix: "callcaster-output" }, messages: MESSAGES,
      buildArgs: () => [],
    })).rejects.toThrow("disk full");
    expect(spawn).not.toHaveBeenCalled();
    expect(rm).toHaveBeenCalledTimes(3);
    for (const [path] of writeFile.mock.calls) expect(rm).toHaveBeenCalledWith(path, { force: true });
  });

  test.each(["exit", "abort", "read"])("removes multiple inputs and output after %s failure", async failure => {
    const rm = vi.fn(async () => undefined), readFile = vi.fn(async () => { throw new Error("output unreadable"); });
    mockFs(rm, { readFile });
    const { proc, spawn } = mockSpawn();
    const mod = await import("../app/lib/audio-process.server");
    const controller = new AbortController();
    const pending = mod.runAudioProcess({ command: "ffmpeg", inputBuffers: [Buffer.from("first"), Buffer.from("second")],
      stage: { prefix: "callcaster-input" }, stageOutput: { prefix: "callcaster-output" }, messages: MESSAGES,
      buildArgs: () => [], signal: controller.signal,
    }).catch((error: unknown) => error);
    await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
    if (failure === "abort") controller.abort(); else proc.emit("close", failure === "exit" ? 1 : 0);
    expect(await pending).toBeInstanceOf(Error);
    expect(rm).toHaveBeenCalledTimes(3);
    expect(proc.kill).toHaveBeenCalledWith("SIGKILL");
    expect(readFile).toHaveBeenCalledTimes(failure === "read" ? 1 : 0);
  });
});
