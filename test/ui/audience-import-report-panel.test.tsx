import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { AudienceUploadProgressPanel } from "@/components/audience/AudienceUploadProgressPanel";

test("real shared dialog closes, reopens and keeps the recovery actions usable", async () => {
  const retry = vi.fn(); const user = userEvent.setup();
  render(<AudienceUploadProgressPanel status="error" progress={80} processedContacts={40} totalContacts={50}
    workspaceId="workspace-one" uploadId={17} errorMessage="Import interrupted after 40 rows"
    showCompletionChrome onTryAgain={retry} />);
  const dialog = await screen.findByRole("dialog", { name: "Upload failed" });
  expect(within(dialog).getByRole("link", { name: "Download row report" })).toHaveAttribute("href", "/workspaces/workspace-one/audience-imports/17/report");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByRole("link", { name: "Download row report" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Upload details" }));
  const reopened = await screen.findByRole("dialog", { name: "Upload failed" });
  await user.click(within(reopened).getByRole("button", { name: "Try Again" }));
  expect(retry).toHaveBeenCalledTimes(1);
});

test("a changed warning is readable after the previous warning was dismissed", async () => {
  const user = userEvent.setup();
  const props = { status:"processing" as const, progress:20, processedContacts:2, totalContacts:10,
    showCompletionChrome:true, onTryAgain:vi.fn() };
  const { rerender } = render(<AudienceUploadProgressPanel {...props} warning="Progress is delayed" />);
  expect(await screen.findByText("Progress is delayed")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  rerender(<AudienceUploadProgressPanel {...props} warning="Still processing; the worker will retry" />);
  expect(await screen.findByText("Still processing; the worker will retry")).toBeInTheDocument();
});
