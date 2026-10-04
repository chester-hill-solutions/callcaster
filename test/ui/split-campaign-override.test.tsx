import userEvent from "@testing-library/user-event";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { SplitCampaignPrompt } from "@/components/campaign/settings/detailed/CampaignDetailed.SplitCampaign";

// #1482: the bulk-on-local safeguard stays the default, and an admin can
// override it only through a deliberate, acknowledged confirmation.
const submitted: Array<Record<string, string>> = [];
type ActionResult = { success: boolean; actionType: string; enabled?: boolean; error?: string };
let reply: (fields: Record<string, string>) => Promise<ActionResult>;
beforeEach(() => {
  submitted.length = 0;
  reply = async fields => ({ success: true, actionType: "bulk_local_override", enabled: fields.enabled === "true" });
});
const actionSpy = vi.fn(async ({ request }: { request: Request }) => {
  const form = await request.formData();
  const fields = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  submitted.push(fields);
  return reply(fields);
});

function renderPrompt(overrideActive: boolean) {
  const router = createMemoryRouter(
    [
      {
        path: "/workspaces/:id/campaigns/:selected_id/settings",
        element: <SplitCampaignPrompt queueCount={900} senderClass="ca_local" overrideActive={overrideActive} />,
        action: actionSpy,
      },
    ],
    { initialEntries: ["/workspaces/ws-1/campaigns/9/settings"] },
  );
  render(<RouterProvider router={router} />);
}

describe("SplitCampaignPrompt bulk-on-local override", () => {
  test("the padded split body retains its inputs, cancellation and acknowledged submit", async () => {
    const user = userEvent.setup();
    renderPrompt(false);
    await user.click(screen.getByRole("button", { name: "Split into 2 campaigns" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(submitted).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Split into 2 campaigns" }));
    fireEvent.change(screen.getByLabelText("Number of segments"), { target: { value: "3" } });
    const submit = screen.getByRole("button", { name: "Split into 3 campaigns" });
    expect(submit).toBeDisabled();
    await user.click(screen.getByRole("checkbox"));
    expect(submit).toBeEnabled();
    reply = async () => ({ success: true, actionType: "split" });
    await user.click(submit);
    await vi.waitFor(() => expect(submitted).toEqual([{ intent: "split", segmentCount: "3" }]));
  });

  test("the safeguard offers a split and an explicit override that needs acknowledgement", async () => {
    renderPrompt(false);
    expect(screen.getByText("Large bulk send on a local number")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send on this local number anyway" }));
    const confirm = await screen.findByRole("button", { name: "Send anyway" });
    expect(screen.getByRole("heading", { name: "Are you sure?" })).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByText(/900 queued contacts/)).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByText(/does not send messages now/)).toBeInTheDocument();
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await vi.waitFor(() => expect(submitted).toHaveLength(1));
    expect(submitted[0]).toEqual({ intent: "bulk_local_override", enabled: "true" });
  });

  test("Cancel sends nothing and reopening requires a fresh acknowledgement", async () => {
    const user = userEvent.setup();
    renderPrompt(false);
    await user.click(screen.getByRole("button", { name: "Send on this local number anyway" }));
    await user.click(await screen.findByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Send anyway" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(submitted).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Send on this local number anyway" }));
    expect(await screen.findByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Send anyway" })).toBeDisabled();
  });

  test("Escape sends nothing and reopening requires a fresh acknowledgement", async () => {
    const user = userEvent.setup();
    renderPrompt(false);
    await user.click(screen.getByRole("button", { name: "Send on this local number anyway" }));
    await user.click(await screen.findByRole("checkbox"));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("heading", { name: "Are you sure?" })).not.toBeInTheDocument();
    expect(submitted).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Send on this local number anyway" }));
    expect(await screen.findByRole("checkbox")).not.toBeChecked();
  });

  test("pending confirmation locks the checkbox and prevents duplicate writes", async () => {
    let finish: (value: ActionResult) => void = () => {};
    reply = () => new Promise(resolve => { finish = resolve; });
    const user = userEvent.setup();
    renderPrompt(false);
    await user.click(screen.getByRole("button", { name: "Send on this local number anyway" }));
    const checkbox = await screen.findByRole("checkbox");
    await user.click(checkbox);
    await user.click(screen.getByRole("button", { name: "Send anyway" }));
    await vi.waitFor(() => expect(submitted).toHaveLength(1));
    expect(checkbox).toHaveAttribute("disabled");
    const pressSurface = checkbox.closest("label");
    if (!pressSurface) throw new Error("Expected the real React Aria checkbox label");
    await user.click(pressSurface);
    expect(checkbox).toBeChecked();
    const pendingConfirm = screen.getByRole("button", { name: "Saving…" });
    expect(pendingConfirm).toBeDisabled();
    await user.click(pendingConfirm);
    expect(submitted).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await act(async () => { finish({ success: true, actionType: "bulk_local_override", enabled: true }); });
    await vi.waitFor(() => expect(screen.queryByRole("heading", { name: "Are you sure?" })).not.toBeInTheDocument());
    expect(submitted).toHaveLength(1);
  });

  test("a failed override keeps the confirmation available for retry", async () => {
    reply = async () => ({ success: false, actionType: "bulk_local_override", error: "The override could not be saved" });
    const user = userEvent.setup();
    renderPrompt(false);
    await user.click(screen.getByRole("button", { name: "Send on this local number anyway" }));
    await user.click(await screen.findByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Send anyway" }));
    await vi.waitFor(() => expect(submitted).toHaveLength(1));
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Send anyway" })).toBeEnabled());
    expect(screen.getByRole("heading", { name: "Are you sure?" })).toBeInTheDocument();
    expect(screen.queryByText("Bulk-send safeguard overridden")).not.toBeInTheDocument();
    reply = async () => ({ success: true, actionType: "bulk_local_override", enabled: true });
    await user.click(screen.getByRole("button", { name: "Send anyway" }));
    await vi.waitFor(() => expect(submitted).toHaveLength(2));
    await vi.waitFor(() => expect(screen.queryByRole("heading", { name: "Are you sure?" })).not.toBeInTheDocument());
  });

  test("an active override shows what was chosen and how to remove it", () => {
    renderPrompt(true);
    expect(screen.getByText("Bulk-send safeguard overridden")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove override" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Split into/ })).toBeNull();
  });

  test("nothing renders below the bulk threshold", () => {
    const router = createMemoryRouter(
      [{ path: "/w/:id/c/:selected_id/settings", element: <SplitCampaignPrompt queueCount={10} senderClass="ca_local" /> }],
      { initialEntries: ["/w/ws-1/c/9/settings"] },
    );
    const { container } = render(<RouterProvider router={router} />);
    expect(container.textContent).toBe("");
  });
});
