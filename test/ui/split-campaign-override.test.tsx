import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";

import { SplitCampaignPrompt } from "@/components/campaign/settings/detailed/CampaignDetailed.SplitCampaign";

// #1482: the bulk-on-local safeguard stays the default, and an admin can
// override it only through a deliberate, acknowledged confirmation.
const submitted: Array<Record<string, string>> = [];
const actionSpy = vi.fn(async ({ request }: { request: Request }) => {
  const form = await request.formData();
  const fields = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  submitted.push(fields);
  return { success: true, actionType: "bulk_local_override", enabled: fields.enabled === "true" };
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
  test("the safeguard offers a split and an explicit override that needs acknowledgement", async () => {
    renderPrompt(false);
    expect(screen.getByText("Large bulk send on a local number")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send on this local number anyway" }));
    const confirm = await screen.findByRole("button", { name: "Override and allow this send" });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await vi.waitFor(() => expect(submitted).toHaveLength(1));
    expect(submitted[0]).toEqual({ intent: "bulk_local_override", enabled: "true" });
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
