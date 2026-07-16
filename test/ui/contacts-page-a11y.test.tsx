import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";

// Regression test for audit-F's contacts-list link-name axe violation: the
// per-row "Edit" action was an icon-only <a> (MdEdit) with no text/aria-label.
describe("app/components/contacts/ContactsPage.tsx", () => {
  test("the per-row edit link has an accessible name", async () => {
    const ContactsPage = (await import("@/components/contacts/ContactsPage"))
      .default;
    const router = createMemoryRouter(
      [
        {
          path: "/workspaces/:id/contacts",
          Component: ContactsPage,
          loader: () => ({
            contacts: [
              {
                id: 1,
                firstname: "Ada",
                surname: "Lovelace",
                phone: "+15551234567",
                email: "ada@example.com",
                address: "1 Main St",
                city: "Springfield",
                other_data: null,
                created_at: new Date().toISOString(),
              },
            ],
            workspace: { id: "ws-1", name: "Test", credits: 10, feature_flags: null },
            error: null,
            userRole: "admin",
            flags: null,
            campaigns: [],
            pagination: {
              currentPage: 1,
              totalPages: 1,
              totalCount: 1,
              pageSize: 25,
            },
          }),
        },
      ],
      { initialEntries: ["/workspaces/ws-1/contacts"] },
    );
    render(createElement(RouterProvider, { router }));

    expect(
      await screen.findByRole("link", { name: "Edit Ada Lovelace" }),
    ).toBeInTheDocument();
  });
});
