import { act, cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import Workspace from "@/routes/workspaces+/$id";

vi.mock("@/routes/workspaces+/$id.loader.server", () => ({ loader: vi.fn() }));
vi.mock("@/routes/workspaces+/$id.middleware.server", () => ({
  middleware: [],
}));
vi.mock("@/components/workspace/WorkspaceNav", () => ({
  default: ({
    workspace,
    campaigns,
    campaignQueueProgress,
  }: {
    workspace: { credits: number };
    campaigns: Array<{ status: string }>;
    campaignQueueProgress: Record<string, { completedCount: number }>;
  }) => (
    <nav>
      {workspace.credits} credits; {campaigns[0]?.status};{" "}
      {campaignQueueProgress["20"]?.completedCount} done
    </nav>
  ),
}));

class TestEventSource extends EventTarget {
  static CLOSED = 2;
  static instances: TestEventSource[] = [];
  readyState = 1;
  constructor(public url: string) {
    super();
    TestEventSource.instances.push(this);
  }
  close() {
    this.readyState = TestEventSource.CLOSED;
  }
  emit(table = "campaign_queue", workspaceId = "ws-1") {
    this.dispatchEvent(
      new MessageEvent("workspace_event", {
        data: JSON.stringify({
          id: 1,
          workspace_id: workspaceId,
          event_type: "postgres_change",
          payload: {
            table,
            eventType: "UPDATE",
            new: { id: 20, workspace: workspaceId },
          },
          created_at: "2026-10-18T00:00:00Z",
        }),
      }),
    );
  }
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function fixture() {
  let credits = 42;
  let status = "running";
  let completedCount = 0;
  let refreshBlock: ReturnType<typeof deferred> | null = null;
  const navigationBlock = deferred();
  let starts = 0;
  let aborts = 0;
  let setupStarts = 0;
  const router = createMemoryRouter(
    [
      {
        path: "/workspaces/:workspaceId",
        Component: Workspace,
        HydrateFallback: () => <p>Loading workspace</p>,
        loader: async ({ request, params }) => {
          starts++;
          request.signal.addEventListener("abort", () => {
            aborts++;
          });
          const data = {
            userRole: "owner",
            workspaceData: {
              workspace: { id: params.workspaceId, name: "Workspace", credits },
              campaigns: [{ id: 20, status }],
              audiences: [],
              phoneNumbers: [],
            },
            onboardingReadiness: {
              shouldShowOnboardingBanner: false,
              warnings: [],
            },
            campaignQueueProgress: {
              "20": { completedCount, totalCount: 100 },
            },
          };
          await refreshBlock?.promise;
          return data;
        },
        children: [
          { path: "results", element: <p>Results</p> },
          {
            path: "setup",
            element: <p>Setup</p>,
            loader: async ({ request }) => {
              setupStarts++;
              request.signal.addEventListener("abort", () => {
                aborts++;
              });
              await navigationBlock.promise;
              return null;
            },
          },
        ],
      },
    ],
    { initialEntries: ["/workspaces/ws-1/results"] },
  );
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(<RouterProvider router={router} />);
  });
  expect(screen.getByText("Results")).toBeInTheDocument();
  return {
    router,
    view,
    navigationBlock,
    get source() {
      const source = TestEventSource.instances.at(-1);
      if (!source) throw new Error("Workspace event stream was not opened");
      return source;
    },
    get starts() {
      return starts;
    },
    get setupStarts() {
      return setupStarts;
    },
    get aborts() {
      return aborts;
    },
    setFinalData() {
      credits = 30;
      status = "completed";
      completedCount = 100;
    },
    blockRefresh() {
      refreshBlock = deferred();
      return refreshBlock;
    },
  };
}

const tick = (ms = 100) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  TestEventSource.instances = [];
  vi.stubGlobal("EventSource", TestEventSource);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("workspace campaign and credit realtime revalidation", () => {
  test.each(["campaign", "campaign_queue", "transaction_history"])(
    "coalesces a %s burst and displays fresh final data",
    async (table) => {
      const f = await fixture();
      f.setFinalData();
      act(() => {
        for (let i = 0; i < 100; i++) {
          f.source.emit(table);
        }
      });
      expect(f.starts).toBe(1);
      await tick();
      expect(f.starts).toBe(2);
      expect(screen.getByRole("navigation")).toHaveTextContent(
        "30 credits; completed; 100 done",
      );
      await tick(1000);
      expect(f.starts).toBe(2);
      expect(f.aborts).toBe(0);
      f.router.dispose();
    },
  );

  test("lets a pending user navigation finish before refreshing a 100-event burst", async () => {
    const f = await fixture();
    let navigation!: Promise<void>;
    await act(async () => {
      navigation = f.router.navigate("/workspaces/ws-1/setup");
    });
    for (let i = 0; i < 100; i++) {
      act(() => f.source.emit());
      await tick(1);
    }
    await tick(1000);
    expect({
      workspaceStarts: f.starts,
      setupStarts: f.setupStarts,
      aborts: f.aborts,
    }).toEqual({ workspaceStarts: 1, setupStarts: 1, aborts: 0 });
    f.setFinalData();
    await act(async () => {
      f.navigationBlock.resolve();
      await navigation;
    });
    expect(screen.getByText("Setup")).toBeInTheDocument();
    await tick();
    expect(f.starts).toBe(2);
    expect(f.setupStarts).toBe(2);
    expect(f.aborts).toBe(0);
    expect(f.router.state.navigation.state).toBe("idle");
    expect(screen.getByRole("navigation")).toHaveTextContent(
      "30 credits; completed; 100 done",
    );
    f.router.dispose();
  });

  test("retains one trailing refresh for events received during a slow loader", async () => {
    const f = await fixture();
    const block = f.blockRefresh();
    act(() => f.source.emit());
    await tick();
    expect(f.starts).toBe(2);
    f.setFinalData();
    act(() => {
      for (let i = 0; i < 100; i++) f.source.emit();
    });
    await tick(1000);
    expect(f.starts).toBe(2);
    await act(async () => {
      block.resolve();
    });
    await tick();
    expect(f.starts).toBe(3);
    expect(f.aborts).toBe(0);
    expect(screen.getByRole("navigation")).toHaveTextContent(
      "30 credits; completed; 100 done",
    );
    await tick(1000);
    expect(f.starts).toBe(3);
    f.router.dispose();
  });

  test("keeps table and workspace stream filtering and discards old workspace work", async () => {
    const f = await fixture();
    expect(f.source.url).toBe("/api/workspaces/ws-1/events");
    act(() => f.source.emit("contact"));
    await tick();
    expect(f.starts).toBe(1);
    const oldSource = f.source;
    act(() => oldSource.emit());
    await act(async () => {
      await f.router.navigate("/workspaces/ws-2/results");
    });
    expect(f.starts).toBe(2);
    expect(oldSource.readyState).toBe(TestEventSource.CLOSED);
    expect(f.source.url).toBe("/api/workspaces/ws-2/events");
    act(() => oldSource.emit());
    await tick(1000);
    expect(f.starts).toBe(2);
    act(() => f.source.emit("transaction_history", "ws-2"));
    await tick();
    expect(f.starts).toBe(3);
    f.router.dispose();
  });

  test("cancels a queued refresh on unmount", async () => {
    const f = await fixture();
    act(() => f.source.emit());
    f.view.unmount();
    await tick(1000);
    expect(f.starts).toBe(1);
    f.router.dispose();
  });

  test("does not run trailing work after unmount during a refresh", async () => {
    const f = await fixture();
    const block = f.blockRefresh();
    act(() => f.source.emit());
    await tick();
    act(() => f.source.emit());
    f.view.unmount();
    await act(async () => {
      block.resolve();
    });
    await tick(1000);
    expect(f.starts).toBe(2);
    f.router.dispose();
  });
});
