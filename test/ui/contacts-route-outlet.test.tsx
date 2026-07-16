import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";

import type { ContactsLoaderData } from "@/lib/contacts-loader.types";

// The route re-exports its loader from a server-only module; the component
// under test never runs it, so stub it out to keep the DB out of jsdom.
vi.mock("../../app/routes/workspaces+/$id/contacts.loader.server", () => ({
  loader: vi.fn(),
}));

const workspaceId = "11111111-1111-1111-1111-111111111111";

const contactsLoaderData: ContactsLoaderData = {
  contacts: [],
  workspace: { id: workspaceId, name: "Workspace", credits: 0, feature_flags: {} },
  error: null,
  userRole: null,
  flags: null,
  campaigns: [],
  pagination: { currentPage: 1, totalPages: 0, totalCount: 0, pageSize: 20 },
  searchQuery: "",
};

async function renderContactsRoute(initialEntry: string) {
  const mod = await import("../../app/routes/workspaces+/$id/contacts.route");
  const router = createMemoryRouter(
    [
      {
        path: "/workspaces/:id/contacts",
        Component: mod.default,
        loader: () => contactsLoaderData,
        children: [
          {
            path: ":contactId",
            Component: () => createElement("div", null, "contact-child-route"),
          },
        ],
      },
    ],
    { initialEntries: [initialEntry] },
  );
  return render(createElement(RouterProvider, { router }));
}

describe("app/routes/workspaces+/$id/contacts.route.tsx", () => {
  test("renders the contacts list at the index path", async () => {
    await renderContactsRoute(`/workspaces/${workspaceId}/contacts`);

    expect(await screen.findByRole("heading", { name: "Contacts" })).toBeTruthy();
    expect(screen.queryByText("contact-child-route")).toBeNull();
  });

  test("renders the child route at /contacts/new instead of the list", async () => {
    await renderContactsRoute(`/workspaces/${workspaceId}/contacts/new`);

    expect(await screen.findByText("contact-child-route")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Contacts" })).toBeNull();
  });

  test("renders the child route for an existing contact id", async () => {
    await renderContactsRoute(`/workspaces/${workspaceId}/contacts/42`);

    expect(await screen.findByText("contact-child-route")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Contacts" })).toBeNull();
  });
});
