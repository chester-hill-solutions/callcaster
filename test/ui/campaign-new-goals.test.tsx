import { render, screen } from "@testing-library/react";
import {
  createMemoryRouter,
  Outlet,
  RouterProvider,
} from "react-router";
import { describe, expect, test, vi } from "vitest";

import CampaignsNew from "@/routes/workspaces+/$id/campaigns/new.route";

vi.mock("@/routes/workspaces+/$id/campaigns/new.action.server", () => ({
  action: vi.fn(),
}));

function renderCampaignNew(url: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/workspaces/:id",
        element: <Outlet context={{ userRole: "admin" }} />,
        children: [
          {
            path: "campaigns/new",
            element: <CampaignsNew />,
          },
        ],
      },
    ],
    { initialEntries: [url] },
  );

  return render(<RouterProvider router={router} />);
}

describe("new campaign goals", () => {
  test("renders three accessible product goals", () => {
    renderCampaignNew("/workspaces/ws-1/campaigns/new");

    expect(screen.getByRole("radio", { name: /Live calling/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Text campaign/i })).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /Automated phone menu/i }),
    ).toBeInTheDocument();
  });

  test("uses a valid goal query and ignores an invalid one", () => {
    const valid = renderCampaignNew(
      "/workspaces/ws-1/campaigns/new?goal=text_campaign",
    );
    expect(screen.getByRole("radio", { name: /Text campaign/i })).toBeChecked();
    valid.unmount();

    renderCampaignNew("/workspaces/ws-1/campaigns/new?goal=email");
    expect(screen.getByRole("radio", { name: /Live calling/i })).toBeChecked();
  });
});
