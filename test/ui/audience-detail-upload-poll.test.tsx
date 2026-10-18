import React from "react";
import { act, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, type LoaderFunctionArgs } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import AudienceView from "../../app/routes/workspaces+/$id/audiences/$audience_id.route";
import type { AudienceUpload } from "@/lib/audience-upload.types";

vi.mock("../../app/routes/workspaces+/$id/audiences/$audience_id.loader.server", () => ({
  loader: vi.fn(),
}));
vi.mock("@/components/audience/AudienceTable", () => ({
  AudienceTable: () => <div>Contacts table</div>,
}));
vi.mock("@/components/audience/AudienceUploader", () => ({
  default: () => <div>Upload form</div>,
}));
vi.mock("@/components/audience/AudienceUploadHistory", () => ({
  default: () => <div>Upload history</div>,
}));

const POLL_MS = 5000;

const routers: Array<ReturnType<typeof createMemoryRouter>> = [];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const router of routers.splice(0)) router.dispose();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function upload(status: string): AudienceUpload {
  return {
    id: 1,
    audience_id: 1,
    created_at: "2026-10-01T12:00:00Z",
    status,
    file_name: "a.csv",
    file_size: 1024,
    total_contacts: 10,
    processed_contacts: 4,
    processed_at: null,
    error_message: null,
  };
}

/** A route payload whose only upload is in `latestStatus` (or none). */
function page(latestStatus: string | null) {
  return {
    contacts: [],
    audience: { id: 1, name: "Audience 1" },
    workspace_id: "ws-1",
    audience_id: "1",
    error: null,
    contactsError: null,
    pagination: { currentPage: 1, pageSize: 50, totalCount: 0 },
    sorting: { sortKey: "id", sortDirection: "asc" },
    latestUpload: latestStatus ? upload(latestStatus) : null,
    uploadHistory: [],
    uploadHistoryError: null,
  };
}

/** Mount the real route with a loader that counts how often it runs. */
async function setup(latestStatus: string | null) {
  const loads: string[] = [];
  const router = createMemoryRouter(
    [
      {
        path: "/workspaces/:id/audiences/:audience_id",
        element: <AudienceView />,
        loader: (args: LoaderFunctionArgs) => {
          loads.push(args.params.audience_id ?? "");
          return page(latestStatus);
        },
        HydrateFallback: () => <p>Loading audience...</p>,
      },
    ],
    { initialEntries: ["/workspaces/ws-1/audiences/1"] },
  );
  routers.push(router);
  render(<RouterProvider router={router} />);
  // Fake timers are active, so settle the initial route load without `findBy`.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(screen.getByText("Contacts table")).toBeInTheDocument();
  return { loads };
}

const tick = (ms = POLL_MS) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe("audience detail upload status poll contract (#2719)", () => {
  test("a completed snapshot stops the poll and revalidates the route", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({ ok: true, snapshot: { status: "completed", processed_contacts: 10 } }),
    );
    vi.stubGlobal("fetch", fetcher);
    const { loads } = await setup("processing");

    await tick();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "/api/audience-upload-status?uploadId=1&workspaceId=ws-1",
    );
    expect(loads).toHaveLength(2);

    await tick(POLL_MS * 4);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test("an error snapshot stops the poll and revalidates the route", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({ ok: true, snapshot: { status: "error", error_message: "boom" } }),
    );
    vi.stubGlobal("fetch", fetcher);
    const { loads } = await setup("processing");

    await tick();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(loads).toHaveLength(2);

    await tick(POLL_MS * 4);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test("a processing snapshot keeps polling", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({ ok: true, snapshot: { status: "processing" } }),
    );
    vi.stubGlobal("fetch", fetcher);
    const { loads } = await setup("processing");

    await tick();
    expect(fetcher).toHaveBeenCalledTimes(1);
    await tick();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(loads).toHaveLength(1);
  });

  test("an API failure stops the poll and revalidates the route", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({ ok: false, error: "Upload not found" }, { status: 404 }),
    );
    vi.stubGlobal("fetch", fetcher);
    const { loads } = await setup("processing");

    await tick();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(loads).toHaveLength(2);

    await tick(POLL_MS * 4);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test("a terminal latest upload does not start the poll", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { loads } = await setup("completed");

    await tick(POLL_MS * 3);
    expect(fetcher).not.toHaveBeenCalled();
    expect(loads).toHaveLength(1);
  });
});
