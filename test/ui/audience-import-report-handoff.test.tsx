import React, { useState } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { useAudienceUploadProgress } from "@/components/audience/use-audience-upload-progress";

const events = vi.hoisted(() => ({ onChange: null as null | ((payload: any) => void) }));
vi.mock("@/hooks/realtime/useWorkspaceRealtime", async importOriginal => ({
  ...await importOriginal<typeof import("@/hooks/realtime/useWorkspaceRealtime")>(),
  useWorkspaceEventSubscription: (options: any) => { events.onChange = options.onChange; },
}));
vi.mock("@/hooks/utils/useInterval", async importOriginal => ({
  ...await importOriginal<typeof import("@/hooks/utils/useInterval")>(), useInterval: () => {},
}));
afterEach(() => { toast.dismiss(); });

test("an idle uploader has no completed report action", () => {
  function Idle() {
    useAudienceUploadProgress({ workspaceId: "workspace-one" });
    return <span>Awaiting upload</span>;
  }
  render(<><Toaster /><Idle /></>);
  expect(screen.getByText("Awaiting upload")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name:"Download row report" })).toBeNull();
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
  await act(async () => { events.onChange?.({ eventType:"UPDATE", new:{ status:"completed", audience_id:42 } }); });
  expect(completed).toHaveBeenCalledExactlyOnceWith("42");
  expect(screen.queryByRole("button", { name:"Start owned upload" })).toBeNull();
  expect(await screen.findByText("Call-list upload completed")).toBeInTheDocument();
  expect(screen.getByRole("button", { name:"Download row report" })).toBeInTheDocument();
  await waitFor(() => expect(document.querySelectorAll('[data-sonner-toast]')).toHaveLength(1));
});
