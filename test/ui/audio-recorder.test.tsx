import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AudioRecorder } from "@/components/file-assets/AudioRecorder";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

function microphone() {
  const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
  return { tracks, getTracks: () => tracks };
}

let requests: ReturnType<
  typeof Promise.withResolvers<ReturnType<typeof microphone>>
>[];
let recorderStarts: number;
let recorders: Recorder[];
const originalMediaDevices = Object.getOwnPropertyDescriptor(
  navigator,
  "mediaDevices",
);
class Recorder {
  constructor() {
    recorders.push(this);
  }
  static isTypeSupported() {
    return true;
  }
  state = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start() {
    this.state = "recording";
    recorderStarts += 1;
  }
  stop() {
    this.state = "inactive";
    this.onstop?.();
  }
  pause() {
    this.state = "paused";
  }
  resume() {
    this.state = "recording";
  }
}

beforeEach(() => {
  requests = [];
  recorderStarts = 0;
  recorders = [];
  vi.stubGlobal("MediaRecorder", Recorder);
  vi.stubGlobal("AudioContext", undefined);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:owned-audio-take");
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      enumerateDevices: vi.fn().mockResolvedValue([]),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      getUserMedia: vi.fn(() => {
        const request = Promise.withResolvers<ReturnType<typeof microphone>>();
        requests.push(request);
        return request.promise;
      }),
    },
  });
});
afterEach(() => {
  toast.dismiss();
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalMediaDevices)
    Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
  else Reflect.deleteProperty(navigator, "mediaDevices");
});

test("two activations in one batch acquire only one microphone", () => {
  render(<AudioRecorder onComplete={vi.fn()} />);
  const button = screen.getByRole("button", { name: "Record" });
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(requests).toHaveLength(1);
});

test("Record is disabled while permission is pending", () => {
  render(<AudioRecorder onComplete={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Record" }));
  expect(
    screen.getByRole("button", { name: /Record|Starting/i }),
  ).toBeDisabled();
});

test("cancel releases every track from a late permission result", async () => {
  const onCancel = vi.fn();
  render(<AudioRecorder onComplete={vi.fn()} onCancel={onCancel} />);
  fireEvent.click(screen.getByRole("button", { name: "Record" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  const stream = microphone();
  await act(async () => {
    requests[0].resolve(stream);
  });
  for (const track of stream.tracks) expect(track.stop).toHaveBeenCalledOnce();
  expect(recorderStarts).toBe(0);
  expect(onCancel).toHaveBeenCalledOnce();
});

test("unmount releases every track from a late permission result", async () => {
  const { unmount } = render(<AudioRecorder onComplete={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Record" }));
  unmount();
  const stream = microphone();
  await act(async () => {
    requests[0].resolve(stream);
  });
  for (const track of stream.tracks) expect(track.stop).toHaveBeenCalledOnce();
  expect(recorderStarts).toBe(0);
});

test("a single recording starts and Stop releases every active track", async () => {
  render(<AudioRecorder onComplete={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Record" }));
  const stream = microphone();
  await act(async () => {
    requests[0].resolve(stream);
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Stop" })).toBeEnabled(),
  );
  expect(recorderStarts).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  for (const track of stream.tracks) expect(track.stop).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Use recording" })).toBeEnabled();
});

test("a queued event from an old recorder cannot mix bytes into a new take", async () => {
  const onComplete = vi.fn();
  render(<AudioRecorder onComplete={onComplete} />);
  fireEvent.click(screen.getByRole("button", { name: "Record" }));
  await act(async () => {
    requests[0].resolve(microphone());
  });
  const staleData = recorders[0].ondataavailable;
  act(() => {
    staleData?.({ data: new Blob(["FIRST_TAKE"]) });
  });
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  fireEvent.click(screen.getByRole("button", { name: "Re-take" }));
  fireEvent.click(screen.getByRole("button", { name: "Record" }));
  await act(async () => {
    requests[1].resolve(microphone());
  });
  act(() => {
    staleData?.({ data: new Blob(["OLD_EVENT"]) });
    recorders[1].ondataavailable?.({ data: new Blob(["NEW_TAKE"]) });
  });
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  fireEvent.click(screen.getByRole("button", { name: "Use recording" }));
  expect(onComplete).toHaveBeenCalledOnce();
  expect(onComplete.mock.calls[0][0].size).toBe(8);
});

test("a queued stop from an old recorder cannot replace the new active take", async () => {
  render(<AudioRecorder onComplete={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Record" }));
  await act(async () => {
    requests[0].resolve(microphone());
  });
  const staleStop = recorders[0].onstop;
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  fireEvent.click(screen.getByRole("button", { name: "Re-take" }));
  fireEvent.click(screen.getByRole("button", { name: "Record" }));
  await act(async () => {
    requests[1].resolve(microphone());
  });
  act(() => {
    staleStop?.();
  });
  expect(screen.getByRole("button", { name: "Stop" })).toBeEnabled();
  expect(
    screen.queryByRole("button", { name: "Use recording" }),
  ).not.toBeInTheDocument();
});

test("a late rejection cannot end a newer recording after Cancel", async () => {
  render(
    <>
      <AudioRecorder onComplete={vi.fn()} onCancel={vi.fn()} />
      <Toaster />
    </>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Record" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Record" }));
  const stream = microphone();
  await act(async () => {
    requests[1].resolve(stream);
  });
  await act(async () => {
    requests[0].reject(
      new DOMException("Private old failure", "NotAllowedError"),
    );
  });
  expect(screen.getByRole("button", { name: "Stop" })).toBeEnabled();
  for (const track of stream.tracks) expect(track.stop).not.toHaveBeenCalled();
  expect(
    screen.queryByText(/Microphone access was blocked/),
  ).not.toBeInTheDocument();
});

test("a late stream cannot replace a newer recording after Cancel", async () => {
  render(<AudioRecorder onComplete={vi.fn()} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Record" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Record" }));
  const current = microphone(),
    old = microphone();
  await act(async () => {
    requests[1].resolve(current);
  });
  await act(async () => {
    requests[0].resolve(old);
  });
  for (const track of old.tracks) expect(track.stop).toHaveBeenCalledOnce();
  for (const track of current.tracks) expect(track.stop).not.toHaveBeenCalled();
  expect(recorderStarts).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  for (const track of current.tracks) expect(track.stop).toHaveBeenCalledOnce();
});

test("permission failure keeps safe shared feedback and allows retry", async () => {
  render(
    <>
      <AudioRecorder onComplete={vi.fn()} />
      <Toaster />
    </>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Record" }));
  await act(async () => {
    requests[0].reject(
      new DOMException("Private permission details", "NotAllowedError"),
    );
  });
  expect(
    await screen.findByText(/Microphone access was blocked/),
  ).toBeInTheDocument();
  expect(
    screen.queryByText("Private permission details"),
  ).not.toBeInTheDocument();
  expect(document.querySelector('[data-slot="alert"]')).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Record" }));
  await act(async () => {
    requests[1].resolve(microphone());
  });
  expect(screen.getByRole("button", { name: "Stop" })).toBeEnabled();
});

test.each(["constructor", "start", "stop", "event"])(
  "%s failure releases all tracks and allows a new attempt",
  async (boundary) => {
    render(
      <>
        <AudioRecorder onComplete={vi.fn()} />
        <Toaster />
      </>,
    );
    if (boundary === "constructor") {
      vi.stubGlobal(
        "MediaRecorder",
        class extends Recorder {
          constructor() {
            super();
            throw new Error("Could not start recording");
          }
        },
      );
    }
    if (boundary === "start")
      vi.spyOn(Recorder.prototype, "start").mockImplementationOnce(() => {
        throw new Error("Could not start recording");
      });
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    const stream = microphone();
    await act(async () => {
      requests[0].resolve(stream);
    });
    if (boundary === "stop") {
      vi.spyOn(recorders[0], "stop").mockImplementationOnce(() => {
        throw new Error("Stop failed");
      });
      fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    }
    if (boundary === "event")
      act(() => {
        recorders[0].onerror?.();
      });
    for (const track of stream.tracks)
      expect(track.stop).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Record" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Use recording" }),
    ).not.toBeInTheDocument();
    vi.stubGlobal("MediaRecorder", Recorder);
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    await act(async () => {
      requests[1].resolve(microphone());
    });
    expect(screen.getByRole("button", { name: "Stop" })).toBeEnabled();
  },
);

test("a spontaneous recorder stop releases all owned tracks", async () => {
  render(<AudioRecorder onComplete={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Record" }));
  const stream = microphone();
  await act(async () => {
    requests[0].resolve(stream);
  });
  act(() => {
    recorders[0].stop();
  });
  for (const track of stream.tracks) expect(track.stop).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Use recording" })).toBeEnabled();
});

test("unsupported formats do not request permission and can be retried", async () => {
  const support = vi.spyOn(Recorder, "isTypeSupported").mockReturnValue(false);
  render(
    <>
      <AudioRecorder onComplete={vi.fn()} />
      <Toaster />
    </>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Record" }));
  expect(requests).toHaveLength(0);
  expect(
    await screen.findByText(
      "Audio recording is not supported in this browser.",
    ),
  ).toBeInTheDocument();
  support.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Record" }));
  await act(async () => {
    requests[0].resolve(microphone());
  });
  expect(screen.getByRole("button", { name: "Stop" })).toBeEnabled();
});

test("microphone selection is locked while permission is pending", async () => {
  navigator.mediaDevices.enumerateDevices = vi
    .fn()
    .mockResolvedValue([
      {
        kind: "audioinput",
        deviceId: "fixture-mic",
        label: "Fixture microphone",
        groupId: "fixture",
        toJSON: () => ({}),
      },
    ]);
  render(<AudioRecorder onComplete={vi.fn()} />);
  const selector = screen.getByRole("combobox", { name: "Microphone" });
  await waitFor(() => expect(selector).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Record" }));
  expect(selector).toBeDisabled();
});

test("externally disabled recording does not request permission", () => {
  render(<AudioRecorder onComplete={vi.fn()} disabled />);
  const record = screen.getByRole("button", { name: "Record" });
  expect(record).toBeDisabled();
  fireEvent.click(record);
  expect(requests).toHaveLength(0);
});

test("a queued old error cannot end a new recording", async () => {
  render(<AudioRecorder onComplete={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Record" }));
  await act(async () => {
    requests[0].resolve(microphone());
  });
  const oldError = recorders[0].onerror;
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  fireEvent.click(screen.getByRole("button", { name: "Re-take" }));
  fireEvent.click(screen.getByRole("button", { name: "Record" }));
  const current = microphone();
  await act(async () => {
    requests[1].resolve(current);
  });
  act(() => {
    oldError?.();
  });
  for (const track of current.tracks) expect(track.stop).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Stop" })).toBeEnabled();
});

test("accepted bytes, format and duration exclude the paused interval", async () => {
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const onComplete = vi.fn();
  render(<AudioRecorder onComplete={onComplete} />);
  fireEvent.click(screen.getByRole("button", { name: "Record" }));
  await act(async () => {
    requests[0].resolve(microphone());
  });
  act(() => {
    recorders[0].ondataavailable?.({ data: new Blob(["NEW_TAKE"]) });
  });
  now = 1000;
  fireEvent.click(screen.getByRole("button", { name: "Pause" }));
  now = 1500;
  fireEvent.click(screen.getByRole("button", { name: "Resume" }));
  now = 2000;
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  fireEvent.click(screen.getByRole("button", { name: "Use recording" }));
  expect(onComplete).toHaveBeenCalledOnce();
  const [blob, format, duration] = onComplete.mock.calls[0];
  expect(blob.size).toBe(8);
  expect(blob.type).toBe("audio/webm;codecs=opus");
  expect(format).toBe("audio/webm;codecs=opus");
  expect(duration).toBe(1500);
});

test("retake and unmount each release the accepted preview URL", async () => {
  const revoke = vi.spyOn(URL, "revokeObjectURL");
  const { unmount } = render(<AudioRecorder onComplete={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Record" }));
  await act(async () => {
    requests[0].resolve(microphone());
  });
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  fireEvent.click(screen.getByRole("button", { name: "Re-take" }));
  expect(revoke).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Record" }));
  await act(async () => {
    requests[1].resolve(microphone());
  });
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  unmount();
  expect(revoke).toHaveBeenCalledTimes(2);
});

test("unmount releases the meter graph, animation and active microphone", async () => {
  const close = vi.fn().mockResolvedValue(undefined);
  const cancel = vi.fn();
  vi.stubGlobal("requestAnimationFrame", vi.fn().mockReturnValue(71));
  vi.stubGlobal("cancelAnimationFrame", cancel);
  vi.stubGlobal(
    "AudioContext",
    class {
      state = "running";
      close = close;
      createMediaStreamSource() {
        return { connect: vi.fn() };
      }
      createAnalyser() {
        return {
          fftSize: 0,
          frequencyBinCount: 2,
          getByteTimeDomainData: vi.fn(),
        };
      }
    },
  );
  const { unmount } = render(<AudioRecorder onComplete={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Record" }));
  const stream = microphone();
  await act(async () => {
    requests[0].resolve(stream);
  });
  unmount();
  expect(close).toHaveBeenCalledOnce();
  expect(cancel).toHaveBeenCalledWith(71);
  for (const track of stream.tracks) expect(track.stop).toHaveBeenCalledOnce();
});

test("phase changes are announced while the timer stays silent", async () => {
  render(<AudioRecorder onComplete={vi.fn()} />);
  expect(
    screen.getByRole("status", { name: "Recording status" }),
  ).toHaveTextContent("Ready to record");
  expect(screen.getByText("00:00")).toHaveAttribute("aria-live", "off");
  fireEvent.click(screen.getByRole("button", { name: "Record" }));
  expect(
    screen.getByRole("status", { name: "Recording status" }),
  ).toHaveTextContent("Starting");
  await act(async () => {
    requests[0].resolve(microphone());
  });
  expect(
    screen.getByRole("status", { name: "Recording status" }),
  ).toHaveTextContent("Recording");
  fireEvent.click(screen.getByRole("button", { name: "Pause" }));
  expect(
    screen.getByRole("status", { name: "Recording status" }),
  ).toHaveTextContent("Paused");
  fireEvent.click(screen.getByRole("button", { name: "Resume" }));
  expect(
    screen.getByRole("status", { name: "Recording status" }),
  ).toHaveTextContent("Recording");
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  expect(
    screen.getByRole("status", { name: "Recording status" }),
  ).toHaveTextContent("Recording ready");
});
