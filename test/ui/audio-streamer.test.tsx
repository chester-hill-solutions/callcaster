import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    logger: { error: vi.fn() },
  };
});

vi.mock("@/lib/logger.client", () => ({ logger: mocks.logger }));

class MockWebSocket {
  static OPEN = 1;
  static instances: MockWebSocket[] = [];
  readyState = MockWebSocket.OPEN;
  url: string;
  send = vi.fn();
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }
}

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = [];
  stream: any;
  ondataavailable: ((ev: any) => void) | null = null;
  start = vi.fn();
  stop = vi.fn();

  constructor(stream: any) {
    this.stream = stream;
    MockMediaRecorder.instances.push(this);
  }
}

describe("AudioStreamer", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.logger.error.mockReset();
    MockWebSocket.instances = [];
    MockMediaRecorder.instances = [];
    (globalThis as any).WebSocket = MockWebSocket;
    (globalThis as any).MediaRecorder = MockMediaRecorder;
    (globalThis as any).navigator.mediaDevices = {
      getUserMedia: vi.fn(),
    };
  });

  test("connects websocket on mount and closes on unmount", async () => {
    const mod = await import("@/AudioStreamer");
    const { unmount } = render(<mod.default />);
    expect(MockWebSocket.instances).toHaveLength(1);
    unmount();
    expect(MockWebSocket.instances[0]?.close).toHaveBeenCalled();
  });

  test("streams blobs when recording; stopRecording stops recorder and tracks", async () => {
    const tracks = [{ stop: vi.fn() }];
    const stream = { getTracks: () => tracks };
    (navigator.mediaDevices.getUserMedia as any).mockResolvedValueOnce(stream);

    const mod = await import("@/AudioStreamer");
    render(<mod.default />);

    const startBtn = screen.getByRole("button", { name: "Start Streaming" });
    const stopBtn = screen.getByRole("button", { name: "Stop Streaming" });
    expect(startBtn).not.toBeDisabled();
    expect(stopBtn).toBeDisabled();

    await act(async () => {
      fireEvent.click(startBtn);
    });

    expect(MockMediaRecorder.instances).toHaveLength(1);
    const recorder = MockMediaRecorder.instances[0]!;
    expect(recorder.start).toHaveBeenCalledWith(1000);

    // dataavailable sends when size > 0 and socket OPEN
    await act(async () => {
      recorder.ondataavailable?.({ data: new Blob(["x"]) });
    });
    expect(MockWebSocket.instances[0]!.send).toHaveBeenCalled();

    // does NOT send when size is 0 or socket not open
    MockWebSocket.instances[0]!.send.mockClear();
    MockWebSocket.instances[0]!.readyState = 0;
    await act(async () => {
      recorder.ondataavailable?.({ data: new Blob([]) });
      recorder.ondataavailable?.({ data: new Blob(["y"]) });
    });
    expect(MockWebSocket.instances[0]!.send).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(stopBtn);
    });
    expect(recorder.stop).toHaveBeenCalled();
    expect(tracks[0]!.stop).toHaveBeenCalled();
  });

  test("startRecording logs on getUserMedia failure", async () => {
    (navigator.mediaDevices.getUserMedia as any).mockRejectedValueOnce(new Error("nope"));
    const mod = await import("@/AudioStreamer");
    render(<mod.default />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start Streaming" }));
    });

    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Error accessing media devices.",
      expect.anything()
    );
  });
});

