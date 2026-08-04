import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

const adminLoaderData = {
  user: {
    first_name: "Ada",
    username: "ada",
    access_level: "sudo",
  },
  workspaces: [],
  users: [],
  workspaceUsers: [],
  workspaceRows: [],
  campaigns: [],
  deadLetteredJobs: [],
  stats: {
    totalWorkspaces: 1,
    activeWorkspaces: 1,
    totalUsers: 2,
    totalCampaigns: 3,
  },
};

describe("admin layout outlet split", () => {
  test("route module renders child outlet without dashboard markup", async () => {
    const source = await import.meta.glob<string>("../../app/routes/admin+/route.tsx", {
      query: "?raw",
      import: "default",
      eager: true,
    });
    const routeSource = Object.values(source)[0];
    expect(routeSource).toContain("useOutlet");
    expect(routeSource).toContain("if (!isIndexRoute)");
    expect(routeSource).toContain("return <Outlet />");
  });

  test("dashboard page renders for the admin index", async () => {
    const { AdminDashboardPage } = await import("@/components/admin/AdminDashboardPage");
    const router = createMemoryRouter(
      [
        {
          path: "/",
          Component: () => <AdminDashboardPage />,
          loader: () => adminLoaderData,
        },
      ],
      { initialEntries: ["/"] },
    );

    render(createElement(RouterProvider, { router }));
    expect(await screen.findByRole("heading", { name: "Admin Dashboard" })).toBeInTheDocument();
  });
});

describe("services list semantics", () => {
  test("route-owned list items wrap article cards without nested list items", async () => {
    const Services = (await import("@/routes/services")).default;
    const { container } = render(<Services />);

    const items = container.querySelectorAll("ul > li");
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.querySelector(":scope > article")).toBeTruthy();
      expect(item.querySelector(":scope > li")).toBeNull();
    }
  });
});

describe("ServiceCard semantics", () => {
  test("renders as an article inside a list item owner", async () => {
    const ServiceCard = (await import("@/components/other-services/ServiceCard")).default;
    const { container } = render(
      <ul>
        <li>
          <ServiceCard title="Data Management" description="Organize campaign data" />
        </li>
      </ul>,
    );

    expect(container.querySelector("li > article")).toBeTruthy();
    expect(screen.getByText("Data Management")).toBeInTheDocument();
  });
});

describe("signup closed state width", () => {
  test("contact form wrapper avoids fixed min-width", async () => {
    const source = await import.meta.glob<string>("../../app/routes/signup.tsx", {
      query: "?raw",
      import: "default",
      eager: true,
    });
    const signupSource = Object.values(source)[0];
    expect(signupSource).not.toContain("min-w-[400px]");
    expect(signupSource).toContain("max-w-md");
  });
});
