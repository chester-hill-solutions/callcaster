import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { CampaignPlaceNav } from "@/components/campaign/CampaignPlaceNav";
import { CampaignShellDirtyProvider, useCampaignShellDirty } from "@/components/campaign/home/CampaignShellDirty";
import { useEffect } from "react";

function renderPlaceNav(current: "setup" | "content" | "queue" | "launch") {
  const router = createMemoryRouter(
    [
      {
        path: "/workspaces/:id/campaigns/:selected_id/*",
        element: <CampaignPlaceNav current={current} />,
      },
    ],
    {
      initialEntries: [`/workspaces/ws-1/campaigns/9/${current === "setup" ? "settings" : current}`],
    },
  );
  render(<RouterProvider router={router} />);
}

describe("CampaignPlaceNav", () => {
  test("Setup shows Next to Content and no Back", () => {
    renderPlaceNav("setup");
    expect(screen.queryByTestId("campaign-place-nav-back")).not.toBeInTheDocument();
    const next = screen.getByTestId("campaign-place-nav-next");
    expect(next).toHaveTextContent("Next: Content");
    expect(next).toHaveAttribute("href", "/workspaces/ws-1/campaigns/9/script/edit");
  });

  test("Queue shows Back to Content and Next to Launch", () => {
    renderPlaceNav("queue");
    const back = screen.getByTestId("campaign-place-nav-back");
    expect(back).toHaveTextContent("Back to Content");
    expect(back).toHaveAttribute("href", "/workspaces/ws-1/campaigns/9/script/edit");
    const next = screen.getByTestId("campaign-place-nav-next");
    expect(next).toHaveTextContent("Next: Launch");
    expect(next).toHaveAttribute("href", "/workspaces/ws-1/campaigns/9/launch");
  });

  test("Launch shows Back to Queue and View Results", () => {
    renderPlaceNav("launch");
    expect(screen.getByTestId("campaign-place-nav-back")).toHaveAttribute(
      "href",
      "/workspaces/ws-1/campaigns/9/queue",
    );
    expect(screen.getByTestId("campaign-place-nav-next")).toHaveTextContent(
      "View Results",
    );
  });
});

function DirtySetupNav() {
  const { setIsDirty } = useCampaignShellDirty();
  useEffect(() => {
    setIsDirty(true);
  }, [setIsDirty]);
  return <CampaignPlaceNav current="setup" />;
}

describe("CampaignPlaceNav with unsaved Setup changes (#1128)", () => {
  test("Next is inert and explains why while edits are unsaved", () => {
    const router = createMemoryRouter(
      [
        {
          path: "/workspaces/:id/campaigns/:selected_id/*",
          element: (
            <CampaignShellDirtyProvider>
              <DirtySetupNav />
            </CampaignShellDirtyProvider>
          ),
        },
      ],
      { initialEntries: ["/workspaces/ws-1/campaigns/9/settings"] },
    );
    render(<RouterProvider router={router} />);
    const next = screen.getByTestId("campaign-place-nav-next");
    expect(next.tagName).toBe("BUTTON");
    expect(next).toBeDisabled();
    expect(next).not.toHaveAttribute("href");
    expect(next).toHaveAccessibleDescription("Save or discard your changes to continue.");
    expect(screen.getByText("Save or discard your changes to continue.")).toBeVisible();
    expect(next).toHaveTextContent("Next: Content");
  });
});
