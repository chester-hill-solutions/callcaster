import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { CampaignPlaceNav } from "@/components/campaign/CampaignPlaceNav";

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
