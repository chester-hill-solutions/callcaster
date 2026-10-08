import React, { useState } from "react";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { AudienceUploadProgressPanel } from "@/components/audience/AudienceUploadProgressPanel";
import { useAudienceUploadProgress } from "@/components/audience/use-audience-upload-progress";

const events = vi.hoisted(() => ({ onChange: null as null | ((payload: any) => void) }));
vi.mock("@/hooks/realtime/useWorkspaceRealtime", async importOriginal => ({
  ...await importOriginal<typeof import("@/hooks/realtime/useWorkspaceRealtime")>(),
  useWorkspaceEventSubscription: (options: any) => { events.onChange = options.onChange; },
}));
vi.mock("@/hooks/utils/useInterval", async importOriginal => ({
  ...await importOriginal<typeof import("@/hooks/utils/useInterval")>(), useInterval: () => {},
}));
afterEach(() => { toast.dismiss(); vi.unstubAllGlobals(); });

test("an idle uploader has no completed report action", () => {
  function Idle() {
    useAudienceUploadProgress({ workspaceId: "workspace-one" });
    return <span>Awaiting upload</span>;
  }
  render(<><Toaster /><Idle /></>);
  expect(screen.getByText("Awaiting upload")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name:"Download row report" })).toBeNull();
});

test("queued uploads gain their download only when real progress carries saved evidence", async () => {
  function Upload() {
    const upload = useAudienceUploadProgress({ workspaceId: "workspace-one" });
    const progress = upload.progress;
    return <><button onClick={() => upload.beginProcessing({ uploadId:17, audienceId:"42", totalContacts:2 })}>Queue upload</button>
      {progress.kind === "processing" && <AudienceUploadProgressPanel status="processing" progress={progress.progress}
        processedContacts={progress.processedContacts} totalContacts={progress.totalContacts} workspaceId="workspace-one"
        uploadId={progress.uploadId} reportAvailable={progress.reportAvailable} showCompletionChrome onTryAgain={() => {}} />}</>;
  }
  render(<Upload />);
  await act(async () => { screen.getByRole("button", { name:"Queue upload" }).click(); });
  expect(screen.getByText("Download row report").closest("a")).not.toHaveAttribute("href");
  await act(async () => { events.onChange?.({ eventType:"UPDATE", new:{ status:"processing", import_run_id:"owned-run" } }); });
  expect(screen.getByRole("link", { name:"Download row report" })).toHaveAttribute("href", "/workspaces/workspace-one/audience-imports/17/report");
});

test("the real root toast keeps the report action after the caller removes the completed uploader", async () => {
  const completed = vi.fn();
  function Upload({ done }: { done: (id: string) => void }) {
    const progress = useAudienceUploadProgress({ workspaceId: "workspace-one", onUploadComplete: done });
    return <button onClick={() => progress.beginProcessing({ uploadId:17, audienceId:"42", totalContacts:2 })}>Start owned upload</button>;
  }
  function Caller() {
    const [show, setShow] = useState(true);
    return <><Toaster />{show && <Upload done={id => { completed(id); setShow(false); }} />}</>;
  }
  render(<Caller />);
  await act(async () => { screen.getByRole("button", { name:"Start owned upload" }).click(); });
  await act(async () => { events.onChange?.({ eventType:"UPDATE", new:{ status:"completed", audience_id:42, import_run_id:"owned-run" } }); });
  expect(completed).toHaveBeenCalledExactlyOnceWith("42");
  expect(screen.queryByRole("button", { name:"Start owned upload" })).toBeNull();
  expect(await screen.findByText("Call-list upload completed")).toBeInTheDocument();
  expect(screen.getByRole("button", { name:"Download row report" })).toBeInTheDocument();
  await waitFor(() => expect(document.querySelectorAll('[data-sonner-toast]')).toHaveLength(1));
});


test.each(["processing", "completed", "error"])("a delayed %s snapshot stays with its old upload attempt", async status => {
  let resolveOld!: (response: Response) => void;
  const oldResponse = new Promise<Response>(resolve => { resolveOld = resolve; });
  vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(oldResponse).mockResolvedValueOnce(
    new Response(JSON.stringify({ ok: true, snapshot: { status: "processing", report_available: false } })),
  ));
  const completed = vi.fn();
  const { result } = renderHook(() => useAudienceUploadProgress({ workspaceId: "workspace-one", onUploadComplete: completed }));
  await act(async () => { result.current.beginProcessing({ uploadId: 17, audienceId: "42", totalContacts: 2 }); });
  await act(async () => {
    result.current.reset(); result.current.startSubmitting(3);
    result.current.beginProcessing({ uploadId: 18, audienceId: "43", totalContacts: 3 });
  });
  await act(async () => { resolveOld(new Response(JSON.stringify({ ok: true, snapshot: {
    uploadId: 17, status, audience_id: 42, report_available: true, total_contacts: 2, processed_contacts: 2,
  } }))); });
  expect(result.current.progress).toMatchObject({ kind: "processing", uploadId: 18, audienceId: "43", totalContacts: 3, processedContacts: 0, progress: 0, reportAvailable: false });
  expect(completed).not.toHaveBeenCalled();
});

test.each(["processing", "completed", "error"])("a delayed %s snapshot cannot cross a retry of the same upload ID", async status => {
  let resolveOld!: (response: Response) => void;
  const oldResponse = new Promise<Response>(resolve => { resolveOld = resolve; });
  vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(oldResponse).mockResolvedValueOnce(
    new Response(JSON.stringify({ ok: true, snapshot: { status: "processing", report_available: false } })),
  ));
  const completed = vi.fn();
  const { result } = renderHook(() => useAudienceUploadProgress({ workspaceId: "workspace-one", onUploadComplete: completed }));
  await act(async () => { result.current.beginProcessing({ uploadId: 17, audienceId: "42", totalContacts: 2 }); });
  await act(async () => { result.current.reset(); result.current.beginProcessing({ uploadId: 17, audienceId: "42", totalContacts: 2 }); });
  await act(async () => { resolveOld(new Response(JSON.stringify({ ok: true, snapshot: {
    uploadId: 17, status, audience_id: 42, report_available: true, total_contacts: 2, processed_contacts: 2,
  } }))); });
  expect(result.current.progress).toMatchObject({ kind: "processing", uploadId: 17, processedContacts: 0, progress: 0, reportAvailable: false });
  expect(completed).not.toHaveBeenCalled();
});

test.each(["network", "http", "malformed"])("a delayed old %s failure cannot warn the new upload", async failure => {
  let resolveOld!: (response: Response) => void;
  let rejectOld!: (reason: Error) => void;
  const oldResponse = new Promise<Response>((resolve, reject) => { resolveOld = resolve; rejectOld = reject; });
  vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(oldResponse).mockResolvedValueOnce(
    new Response(JSON.stringify({ ok: true, snapshot: { status: "processing", report_available: false } })),
  ));
  const { result } = renderHook(() => useAudienceUploadProgress({ workspaceId: "workspace-one" }));
  await act(async () => { result.current.beginProcessing({ uploadId: 17, audienceId: "42", totalContacts: 2 }); });
  await act(async () => { result.current.reset(); result.current.beginProcessing({ uploadId: 18, audienceId: "43", totalContacts: 3 }); });
  await act(async () => {
    if (failure === "network") rejectOld(new Error("Old poll disconnected"));
    else if (failure === "http") resolveOld(new Response(JSON.stringify({ ok: false, error: "gone" }), { status: 404 }));
    else resolveOld(new Response("not JSON"));
  });
  expect(result.current.progress).toMatchObject({ kind: "processing", uploadId: 18, warning: null, reportAvailable: false });
});

test("realtime snapshots require the current attempt and database row ID", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, snapshot: { status: "processing", report_available: false } }))));
  const { result } = renderHook(() => useAudienceUploadProgress({ workspaceId: "workspace-one" }));
  await act(async () => { result.current.beginProcessing({ uploadId: 17, audienceId: "42", totalContacts: 2 }); });
  const oldSubscription = events.onChange;
  await act(async () => { result.current.reset(); result.current.beginProcessing({ uploadId: 18, audienceId: "43", totalContacts: 3 }); });
  await act(async () => { oldSubscription?.({ eventType: "UPDATE", new: { id: 18, status: "completed", report_available: true } }); });
  await act(async () => { events.onChange?.({ eventType: "UPDATE", new: { id: 17, status: "processing", import_run_id: "old-run", processed_contacts: 2 } }); });
  expect(result.current.progress).toMatchObject({ kind: "processing", uploadId: 18, processedContacts: 0, reportAvailable: false });
  await act(async () => { events.onChange?.({ eventType: "UPDATE", new: { id: 18, status: "processing", import_run_id: "current-run", processed_contacts: 1 } }); });
  expect(result.current.progress).toMatchObject({ kind: "processing", uploadId: 18, processedContacts: 1, reportAvailable: true });
});

test("a poll cannot apply after the tenant changes", async () => {
  let resolveOld!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { resolveOld = resolve; })));
  const { result, rerender } = renderHook(({ workspaceId }) => useAudienceUploadProgress({ workspaceId }), { initialProps: { workspaceId: "workspace-one" } });
  await act(async () => { result.current.beginProcessing({ uploadId: 17, audienceId: "42", totalContacts: 2 }); });
  rerender({ workspaceId: "workspace-two" });
  await act(async () => { resolveOld(new Response(JSON.stringify({ ok: true, snapshot: { status: "completed", report_available: true, audience_id: 42 } }))); });
  expect(result.current.progress).toMatchObject({ kind: "processing", uploadId: 17, processedContacts: 0 });
  expect(result.current.progress).not.toHaveProperty("reportAvailable", true);
});
