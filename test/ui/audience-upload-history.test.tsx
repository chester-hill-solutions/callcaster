import React from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, type LoaderFunctionArgs } from "react-router";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import AudienceView from "../../app/routes/workspaces+/$id/audiences/$audience_id.route";
import type { AudienceUpload } from "@/lib/audience-upload.types";

const mocks = vi.hoisted(() => ({ callbacks: [] as Array<{ workspaceId: string; filter: string; onChange: (payload: any) => void }>, rawFetch: vi.fn() }));
vi.mock("../../app/routes/workspaces+/$id/audiences/$audience_id.loader.server", () => ({ loader: vi.fn() }));
vi.mock("@/components/audience/AudienceTable", () => ({ AudienceTable: () => <div>Contacts table</div> }));
vi.mock("@/components/audience/AudienceUploader", () => ({ default: () => <div>Upload form</div> }));
vi.mock("@/hooks/realtime/useWorkspaceEventSubscription", () => ({
  useWorkspaceEventSubscription: (opts: any) => { mocks.callbacks.push(opts); },
}));
vi.mock("@/lib/chats/messaging-client", () => ({ fetchAudienceUploads: (...args: unknown[]) => mocks.rawFetch(...args) }));

const routers: Array<ReturnType<typeof createMemoryRouter>> = [];
afterEach(() => { toast.dismiss(); for (const router of routers.splice(0)) router.dispose(); });
beforeEach(() => { mocks.callbacks = []; mocks.rawFetch.mockReset().mockResolvedValue([]); });
function upload(id = 1, audience_id = 1, file_name = "a.csv"): AudienceUpload {
  return { id, audience_id, created_at: "2026-10-01T12:00:00Z", status: "pending", file_name, file_size: 1024,
    total_contacts: 10, processed_contacts: 4, processed_at: null, error_message: null };
}
function page(workspace: string, audience: number, uploads: AudienceUpload[] | null, error: string | null = null) {
  return { contacts: [], audience: { id: audience, name: `Audience ${audience}` }, workspace_id: workspace,
    audience_id: String(audience), error: null, contactsError: null, pagination: { currentPage: 1, pageSize: 50, totalCount: 0 },
    sorting: { sortKey: "id", sortDirection: "asc" }, latestUpload: null, uploadHistory: uploads, uploadHistoryError: error };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
async function setup(read: (workspace: string, audience: number) => ReturnType<typeof page> | Promise<ReturnType<typeof page>>, initial = "/workspaces/ws-1/audiences/1") {
  const calls: Array<[string, number]> = [];
  const router = createMemoryRouter([{ path: "/workspaces/:id/audiences/:audience_id", element: <AudienceView />,
    loader: ({ params }: LoaderFunctionArgs) => { calls.push([params.id ?? "", Number(params.audience_id)]); return read(params.id ?? "", Number(params.audience_id)); },
    HydrateFallback: () => <p>Loading audience...</p>,
  }], { initialEntries: [initial] });
  routers.push(router); render(<><RouterProvider router={router} /><Toaster position="top-right" /></>);
  const user = userEvent.setup(); await user.click(await screen.findByRole("tab", { name: "Upload History" }));
  return { router, calls, user };
}
function currentSubscription() { const subscription = mocks.callbacks.at(-1); if (!subscription) throw new Error("No current history subscription"); return subscription; }
function historyRow(file: string) { const row = screen.getByText(file).closest("tr"); if (!row) throw new Error("History row is missing"); return row; }
function progressStyle(row: HTMLTableRowElement) { const progress = row.querySelector("div[style]"); if (!progress) throw new Error("Progress bar is missing"); return progress.getAttribute("style"); }

 describe("route-owned audience upload history (#2288)", () => {
  test("initial route data renders status, sizes and progress without a raw mount fetch", async () => {
    const rows: AudienceUpload[] = [
      {
        id: 1,
        audience_id: 99,
        created_at: new Date().toISOString(),
        status: "processing",
        file_name: null,
        file_size: 1024,
        total_contacts: 10,
        processed_contacts: 4,
        processed_at: null,
        error_message: null,
      },
      {
        id: 6,
        audience_id: 99,
        created_at: new Date().toISOString(),
        status: "processing",
        file_name: "zero.csv",
        file_size: 0,
        total_contacts: 0,
        processed_contacts: 0,
        processed_at: null,
        error_message: null,
      },
      {
        id: 2,
        audience_id: 99,
        created_at: new Date().toISOString(),
        status: "completed",
        file_name: "ok.csv",
        file_size: null,
        total_contacts: 5,
        processed_contacts: 5,
        processed_at: new Date().toISOString(),
        error_message: null,
      },
      {
        id: 3,
        audience_id: 99,
        created_at: new Date().toISOString(),
        status: "error",
        file_name: "bad.csv",
        file_size: 0,
        total_contacts: 0,
        processed_contacts: 0,
        processed_at: null,
        error_message: "boom",
      },
      {
        id: 4,
        audience_id: 99,
        created_at: new Date().toISOString(),
        status: "pending",
        file_name: "p.csv",
        file_size: 1024 * 1024,
        total_contacts: 1,
        processed_contacts: 0,
        processed_at: null,
        error_message: null,
      },
      {
        id: 5,
        audience_id: 99,
        created_at: new Date().toISOString(),
        status: "unknown",
        file_name: "u.csv",
        file_size: 1024 * 1024 * 1024,
        total_contacts: 1,
        processed_contacts: 0,
        processed_at: null,
        error_message: null,
      },
    ];
    const { calls } = await setup((workspace, audience) => page(workspace, audience, rows), "/workspaces/ws-1/audiences/99");
    expect(screen.getByText("ok.csv")).toBeInTheDocument();
    expect(screen.getByText("Unknown file")).toBeInTheDocument();
    expect(screen.getAllByText("Unknown")).toHaveLength(2);
    expect(screen.getByText("1.0 KB")).toBeInTheDocument();
    expect(screen.getByText("1.0 MB")).toBeInTheDocument();
    expect(screen.getByText("1.0 GB")).toBeInTheDocument();
    const processing = historyRow("Unknown file");
    expect(progressStyle(processing)).toContain("40%");
    expect(progressStyle(historyRow("zero.csv"))).toContain("0%");
    expect(within(historyRow("ok.csv")).getByText("5")).toBeInTheDocument();
    expect(within(historyRow("bad.csv")).getByTitle("boom")).toBeInTheDocument();
    for (const [file, label] of [["p.csv", "Pending"], ["Unknown file", "Processing"], ["ok.csv", "Completed"], ["bad.csv", "Error"]]) {
      expect(within(historyRow(file)).getByText(label)).toBeInTheDocument();
    }
    expect(calls).toEqual([["ws-1", 99]]); expect(mocks.rawFetch).not.toHaveBeenCalled();
  });
  test("a successful empty route result has an empty state, not a failed read", async () => {
    await setup((workspace, audience) => page(workspace, audience, []));
    expect(screen.getByText("No upload history found for this audience")).toBeInTheDocument();
    expect(screen.queryByText("Error loading upload history")).not.toBeInTheDocument();
  });
  test("initial failure retries through the page loader and keeps retry disabled until completion", async () => {
    const pending = deferred<ReturnType<typeof page>>(); let reads = 0;
    const { calls, user } = await setup((workspace, audience) => ++reads === 1 ? page(workspace, audience, null, "History read failed") : pending.promise);
    expect(screen.getByText("Upload history is unavailable")).toBeInTheDocument();
    expect(screen.queryByText("No upload history found for this audience")).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Retrying..." })).toBeDisabled();
    expect(calls).toEqual([["ws-1", 1], ["ws-1", 1]]);
    await act(async () => pending.resolve(page("ws-1", 1, [upload()])));
    expect(await screen.findByText("a.csv")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Error loading upload history")).not.toBeInTheDocument());
    expect(mocks.rawFetch).not.toHaveBeenCalled();
  });
  test("failed revalidation preserves prior rows, while a successful retry replaces the snapshot", async () => {
    let reads = 0;
    const { router, user } = await setup((workspace, audience) => page(workspace, audience, ++reads === 2 ? null : [upload(1, audience, reads === 1 ? "old.csv" : "new.csv")], reads === 2 ? "Read failed" : null));
    await act(async () => { await router.revalidate(); });
    expect(screen.getByText("old.csv")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("new.csv")).toBeInTheDocument();
    expect(screen.queryByText("old.csv")).not.toBeInTheDocument();
  });
  test("INSERT, UPDATE and DELETE change current rows, deduplicate inserts and ignore foreign audience events", async () => {
    const { calls } = await setup((workspace, audience) => page(workspace, audience, [upload()]));
    expect(currentSubscription()).toMatchObject({ workspaceId: "ws-1", filter: "audience_id=eq.1" });
    const change = (payload: unknown) => act(() => currentSubscription().onChange(payload));
    await change({ eventType: "INSERT", new: upload(2, 1, "b.csv") });
    await change({ eventType: "INSERT", new: upload(2, 1, "b.csv") });
    expect(screen.getAllByText("b.csv")).toHaveLength(1);
    await change({ eventType: "UPDATE", new: { id: 1, audience_id: 1, status: "completed", total_contacts: 10, processed_contacts: 10 } });
    expect(within(historyRow("a.csv")).getByText("Completed")).toBeInTheDocument();
    await change({ eventType: "INSERT", new: upload(3, 2, "foreign.csv") });
    await change({ eventType: "UPDATE", new: { id: 1, audience_id: 2, file_name: "foreign.csv" } });
    await change({ eventType: "DELETE", old: { id: 1, audience_id: 2 } });
    expect(screen.getByText("a.csv")).toBeInTheDocument(); expect(screen.queryByText("foreign.csv")).not.toBeInTheDocument();
    await change({ eventType: "DELETE", old: { id: 2 } });
    await change({ eventType: "DELETE", old: {} });
    await change({ eventType: "UNKNOWN", new: upload() });
    expect(screen.queryByText("b.csv")).not.toBeInTheDocument(); expect(screen.getByText("a.csv")).toBeInTheDocument();
    expect(calls).toHaveLength(1); expect(mocks.rawFetch).not.toHaveBeenCalled();
  });
  test.each(["/workspaces/ws-1/audiences/2", "/workspaces/ws-2/audiences/1"])("navigation to %s isolates rows and ignores a captured prior callback", async (next) => {
    const { router } = await setup((workspace, audience) => page(workspace, audience, [upload(1, audience, `${workspace}-${audience}.csv`)]));
    const previous = currentSubscription().onChange;
    await act(async () => { await router.navigate(next); });
    const expected = next.includes("ws-2") ? "ws-2-1.csv" : "ws-1-2.csv";
    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(screen.queryByText("ws-1-1.csv")).not.toBeInTheDocument();
    await act(async () => previous({ eventType: "INSERT", new: upload(4, 1, "late-event.csv") }));
    expect(screen.queryByText("late-event.csv")).not.toBeInTheDocument(); expect(screen.getByText(expected)).toBeInTheDocument();
  });
  test("late retry completion cannot replace a newly selected audience", async () => {
    const pending = deferred<ReturnType<typeof page>>(); let firstReads = 0;
    const { router, user } = await setup((workspace, audience) => audience === 2 ? page(workspace, audience, [upload(2, 2, "current.csv")]) : ++firstReads === 1 ? page(workspace, audience, null, "Read failed") : pending.promise);
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    await screen.findByRole("button", { name: "Retrying..." });
    await act(async () => { await router.navigate("/workspaces/ws-1/audiences/2"); });
    expect(await screen.findByText("current.csv")).toBeInTheDocument();
    await act(async () => pending.resolve(page("ws-1", 1, [upload(1, 1, "late-retry.csv")])));
    expect(screen.getByText("current.csv")).toBeInTheDocument(); expect(screen.queryByText("late-retry.csv")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Error loading upload history")).not.toBeInTheDocument());
  });
});
