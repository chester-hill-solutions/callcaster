import { Suspense, startTransition, useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useCampaignExport } from "@/hooks/campaign/useCampaignExport";

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));
vi.mock("sonner", () => ({ toast }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const tick = (ms = 2000) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const complete = () =>
  Response.json({
    status: "completed",
    progress: 100,
    downloadUrl: "https://download.test/report",
  });

test("slow status reads stay serial and wait two seconds after each response", async () => {
  const first = deferred<Response>();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ exportId: "one" }))
    .mockImplementationOnce(() => first.promise)
    .mockResolvedValue(complete());
  vi.stubGlobal("fetch", fetcher);
  const h = renderHook(() =>
    useCampaignExport({ campaignId: 7, workspaceId: "ws" }),
  );
  await act(async () => {
    await h.result.current.startExport();
  });
  await tick(10000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await act(async () => {
    first.resolve(Response.json({ status: "processing", progress: 20 }));
  });
  expect(h.result.current.progress).toBe(20);
  await tick(1999);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await tick(1);
  expect(h.result.current.downloadUrl).toBe("https://download.test/report");
  await tick(10000);
  expect(fetcher).toHaveBeenCalledTimes(3);
});

test("unmount aborts an active status read and ignores a late response", async () => {
  const pending = deferred<Response>();
  let signal: AbortSignal | undefined;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ exportId: "one" }))
    .mockImplementationOnce((_url, init) => {
      signal = init?.signal;
      return pending.promise;
    });
  vi.stubGlobal("fetch", fetcher);
  const h = renderHook(() =>
    useCampaignExport({ campaignId: 7, workspaceId: "ws" }),
  );
  await act(async () => {
    await h.result.current.startExport();
  });
  await tick();
  h.unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    pending.resolve(complete());
  });
  await tick(10000);
  expect(toast.success).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test("unmount cancels a pending start without starting a status poll", async () => {
  const pending = deferred<Response>();
  let signal: AbortSignal | undefined;
  const fetcher = vi.fn((_url, init) => {
    signal = init?.signal;
    return pending.promise;
  });
  vi.stubGlobal("fetch", fetcher);
  const h = renderHook(() =>
    useCampaignExport({ campaignId: 7, workspaceId: "ws" }),
  );
  let start!: Promise<void>;
  act(() => {
    start = h.result.current.startExport();
  });
  h.unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    pending.resolve(Response.json({ exportId: "late" }));
    await start;
  });
  await tick(10000);
  expect(toast.info).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("changing workspace discards the old job and its late completion", async () => {
  const pending = deferred<Response>();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ exportId: "old" }))
    .mockImplementationOnce(() => pending.promise)
    .mockResolvedValueOnce(Response.json({ exportId: "new" }))
    .mockResolvedValue(complete());
  vi.stubGlobal("fetch", fetcher);
  const h = renderHook(
    ({ workspaceId }) => useCampaignExport({ campaignId: 7, workspaceId }),
    { initialProps: { workspaceId: "old-ws" } },
  );
  await act(async () => {
    await h.result.current.startExport();
  });
  await tick();
  h.rerender({ workspaceId: "new-ws" });
  expect(h.result.current.isExporting).toBe(false);
  await act(async () => {
    await h.result.current.startExport();
  });
  await act(async () => {
    pending.resolve(complete());
  });
  expect(h.result.current.downloadUrl).toBeNull();
  expect(toast.success).not.toHaveBeenCalled();
  await tick();
  expect(fetcher.mock.calls.at(-1)?.[0]).toBe(
    "/api/campaign-export-status?exportId=new&workspaceId=new-ws",
  );
  expect(toast.success).toHaveBeenCalledTimes(1);
});

test.each(["network", "http", "json"])(
  "retries a transient %s failure before completing",
  async (failure) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ exportId: "one" }));
    if (failure === "network")
      fetcher.mockRejectedValueOnce(new Error("offline"));
    else if (failure === "http")
      fetcher.mockResolvedValueOnce(
        Response.json({ error: "not yet" }, { status: 404 }),
      );
    else fetcher.mockResolvedValueOnce(new Response("broken json"));
    fetcher.mockResolvedValue(complete());
    vi.stubGlobal("fetch", fetcher);
    const h = renderHook(() =>
      useCampaignExport({ campaignId: 7, workspaceId: "ws" }),
    );
    await act(async () => {
      await h.result.current.startExport();
    });
    await tick();
    expect(h.result.current.isExporting).toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
    await tick(2100);
    expect(h.result.current.isExporting).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(h.result.current.progress).toBe(100);
    expect(toast.success).toHaveBeenCalledTimes(1);
  },
);

test("terminal failure stops polling and permits an SMS report retry", async () => {
  const downloads = [
    {
      label: "Messages",
      filename: "sms.csv",
      downloadUrl: "https://download.test/sms",
    },
  ];
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ exportId: "one" }))
    .mockResolvedValueOnce(
      Response.json({ status: "error", error: "Export interrupted" }),
    )
    .mockResolvedValueOnce(Response.json({ exportId: "two" }))
    .mockResolvedValue(Response.json({ status: "completed", downloads }));
  vi.stubGlobal("fetch", fetcher);
  const h = renderHook(() =>
    useCampaignExport({
      campaignId: 7,
      workspaceId: "ws",
      exportType: "sms-report",
    }),
  );
  await act(async () => {
    await h.result.current.startExport();
  });
  await tick();
  await tick(10000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(h.result.current.isExporting).toBe(false);
  expect(toast.error).toHaveBeenCalledWith("Export failed", {
    description: "Export interrupted",
  });
  await act(async () => {
    await h.result.current.startExport();
  });
  await tick();
  expect(h.result.current.downloads).toEqual(downloads);
  const body = fetcher.mock.calls[2]?.[1]?.body as FormData;
  expect(body.get("exportType")).toBe("sms-report");
});

test("a pending start cannot attach to a replacement campaign", async () => {
  const pending = deferred<Response>();
  const fetcher = vi
    .fn()
    .mockImplementationOnce(() => pending.promise)
    .mockResolvedValueOnce(Response.json({ exportId: "new" }))
    .mockResolvedValue(complete());
  vi.stubGlobal("fetch", fetcher);
  const h = renderHook(
    ({ campaignId }) => useCampaignExport({ campaignId, workspaceId: "ws" }),
    { initialProps: { campaignId: 7 } },
  );
  let start!: Promise<void>;
  act(() => {
    start = h.result.current.startExport();
  });
  h.rerender({ campaignId: 8 });
  await act(async () => {
    pending.resolve(Response.json({ exportId: "old" }));
    await start;
  });
  expect(h.result.current.isExporting).toBe(false);
  expect(toast.info).not.toHaveBeenCalled();
  await act(async () => {
    await h.result.current.startExport();
  });
  await tick();
  expect(fetcher.mock.calls.at(-1)?.[0]).toBe(
    "/api/campaign-export-status?exportId=new&workspaceId=ws",
  );
  expect(h.result.current.downloadUrl).toBe("https://download.test/report");
});

test("root StrictMode permits an export and synchronous repeated clicks start one job", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ exportId: "one" }))
    .mockResolvedValue(complete());
  vi.stubGlobal("fetch", fetcher);
  const h = renderHook(
    () => useCampaignExport({ campaignId: 7, workspaceId: "ws" }),
    { reactStrictMode: true },
  );
  await act(async () => {
    await Promise.all([
      h.result.current.startExport(),
      h.result.current.startExport(),
    ]);
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  await tick();
  expect(h.result.current.downloadUrl).toBe("https://download.test/report");
  expect(toast.success).toHaveBeenCalledTimes(1);
});

test("a suspended workspace transition does not invalidate the still-visible export", async () => {
  const pending = deferred<Response>();
  const suspend = new Promise<never>(() => {});
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ exportId: "old" }))
      .mockImplementationOnce(() => pending.promise),
  );
  function Fixture() {
    const [workspaceId, setWorkspace] = useState("old-ws");
    const value = useCampaignExport({ campaignId: 7, workspaceId });
    if (workspaceId === "new-ws") throw suspend;
    return (
      <>
        <button
          onClick={() => {
            void value.startExport();
          }}
        >
          Start
        </button>
        <button onClick={() => startTransition(() => setWorkspace("new-ws"))}>
          Switch
        </button>
        <p>{value.downloadUrl ?? (value.isExporting ? "Exporting" : "Idle")}</p>
      </>
    );
  }
  render(
    <Suspense fallback={<p>Loading</p>}>
      <Fixture />
    </Suspense>,
  );
  await act(async () => {
    fireEvent.click(screen.getByText("Start"));
  });
  await tick();
  await act(async () => {
    fireEvent.click(screen.getByText("Switch"));
  });
  expect(screen.getByText("Exporting")).toBeTruthy();
  await act(async () => {
    pending.resolve(complete());
  });
  expect(screen.getByText("https://download.test/report")).toBeTruthy();
});
