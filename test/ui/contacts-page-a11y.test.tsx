import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type {
  ContactListRow,
  ContactsLoaderData,
} from "@/lib/contacts-loader.types";
import { MemberRole } from "@/lib/member-role";

vi.hoisted(() => {
  process.env.TZ = "UTC";
});

const contacts: ContactListRow[] = [
  {
    id: 1,
    firstname: "Ada",
    surname: "Lovelace",
    phone: "+15551234567",
    email: "ada@example.com",
    address: "1 Main St",
    city: "Springfield",
    other_data: null,
    created_at: "2026-10-15T12:00:00Z",
  },
  {
    id: 2,
    firstname: "Grace",
    surname: "Hopper",
    phone: "+15557654321",
    email: "grace@example.com",
    address: "2 Main St",
    city: "Springfield",
    other_data: null,
    created_at: "2026-10-15T12:00:00Z",
  },
];
const routers: Array<ReturnType<typeof createMemoryRouter>> = [];

afterEach(() => {
  for (const router of routers.splice(0)) router.dispose();
});

async function renderContacts(
  initialEntry = "/workspaces/ws-1/contacts",
  rows = contacts,
) {
  const ContactsPage = (await import("@/components/contacts/ContactsPage"))
    .default;
  const requests: URL[] = [];
  const router = createMemoryRouter(
    [
      {
        path: "/workspaces/:id/contacts",
        Component: ContactsPage,
        loader: ({ request }): ContactsLoaderData => {
          const url = new URL(request.url);
          requests.push(url);
          const query = url.searchParams.get("q")?.toLowerCase() ?? "";
          const matchingContacts = rows.filter((contact) =>
            `${contact.firstname} ${contact.surname}`
              .toLowerCase()
              .includes(query),
          );
          return {
            contacts: matchingContacts,
            workspace: {
              id: "ws-1",
              name: "Test",
              credits: 10,
              feature_flags: null,
            },
            error: null,
            userRole: MemberRole.Admin,
            flags: null,
            campaigns: [],
            pagination: {
              currentPage: Number(url.searchParams.get("page") ?? "1"),
              totalPages: matchingContacts.length ? 1 : 0,
              totalCount: matchingContacts.length,
              pageSize: 25,
            },
          };
        },
      },
    ],
    { initialEntries: [initialEntry] },
  );
  routers.push(router);
  const view = render(createElement(RouterProvider, { router }));
  await screen.findByRole("link", { name: "Back" });
  return { ...view, router, requests };
}

async function typeSearch(
  user: ReturnType<typeof userEvent.setup>,
  router: ReturnType<typeof createMemoryRouter>,
  input: HTMLElement,
  value: string,
) {
  let typed = "";
  for (const key of value) {
    typed += key;
    await user.type(input, key);
    await waitFor(() => {
      expect(router.state.navigation.state).toBe("idle");
      expect(input).toHaveValue(typed);
    });
  }
}

async function expectClearedSearch(
  router: ReturnType<typeof createMemoryRouter>,
  requests: URL[],
  input: HTMLElement,
) {
  expect(
    await screen.findByRole("link", { name: "Edit Ada Lovelace" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Edit Grace Hopper" }),
  ).toBeInTheDocument();
  await waitFor(() => expect(router.state.navigation.state).toBe("idle"));
  const params = new URLSearchParams(router.state.location.search);
  expect(router.state.location.pathname).toBe("/workspaces/ws-1/contacts");
  expect(params.has("q")).toBe(false);
  expect(params.get("page")).toBe("1");
  expect(params.get("sort")).toBe("surname");
  expect(params.getAll("tag")).toEqual(["canvass", "volunteer"]);
  expect(requests.at(-1)?.searchParams.has("q")).toBe(false);
  expect(input).toHaveValue("");
  expect(input).toHaveAccessibleName("Search contacts");
  expect(input).toHaveFocus();
  expect(
    screen.queryByRole("button", { name: "Clear search" }),
  ).not.toBeInTheDocument();
}

describe("app/components/contacts/ContactsPage.tsx", () => {
  test("the per-row edit link has an accessible name", async () => {
    await renderContacts();
    expect(
      screen.getByRole("link", { name: "Edit Ada Lovelace" }),
    ).toHaveAttribute("href", "/workspaces/ws-1/contacts/1");
  });

  test("workspace empty state uses flat empty-state composition", async () => {
    const { container } = await renderContacts("/workspaces/ws-1/contacts", []);
    expect(
      screen.getByTestId("workspace-resource-empty-state"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Add your first contact" }),
    ).toBeInTheDocument();
    expect(container.querySelector("[data-slot='card']")).toBeNull();
  });

  test("search keeps its label and ID when filtering produces no matches", async () => {
    const user = userEvent.setup();
    const { router } = await renderContacts();
    const input = screen.getByRole("textbox", { name: "Search contacts" });
    const inputId = input.id;
    expect(inputId).not.toBe("");
    expect(screen.getByLabelText("Search contacts")).toBe(input);
    expect(
      screen.queryByRole("button", { name: "Clear search" }),
    ).not.toBeInTheDocument();

    await typeSearch(user, router, input, "Nobody");

    expect(
      await screen.findByRole("heading", { name: "Try another search" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search contacts" })).toBe(
      input,
    );
    expect(input).toHaveAttribute("id", inputId);
    expect(input).toHaveAccessibleName("Search contacts");
    expect(screen.getByRole("button", { name: "Clear search" })).toBeEnabled();
    const icons = input.parentElement?.querySelectorAll("svg");
    expect(icons).toHaveLength(2);
    for (const icon of icons ?? [])
      expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  test("typing revalidates filtered contacts, resets the page and keeps other parameters", async () => {
    const user = userEvent.setup();
    const { router, requests } = await renderContacts(
      "/workspaces/ws-1/contacts?page=3&sort=surname&tag=canvass&tag=volunteer",
    );
    const input = screen.getByRole("textbox", { name: "Search contacts" });
    expect(
      screen.getByRole("link", { name: "Edit Grace Hopper" }),
    ).toBeInTheDocument();

    await typeSearch(user, router, input, "Ada");

    await waitFor(() =>
      expect(
        screen.queryByRole("link", { name: "Edit Grace Hopper" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("link", { name: "Edit Ada Lovelace" }),
    ).toBeInTheDocument();
    expect(input).toHaveValue("Ada");
    const params = new URLSearchParams(router.state.location.search);
    expect(params.get("q")).toBe("Ada");
    expect(params.get("page")).toBe("1");
    expect(params.get("sort")).toBe("surname");
    expect(params.getAll("tag")).toEqual(["canvass", "volunteer"]);
    expect(requests.at(-1)?.searchParams.get("q")).toBe("Ada");
  });

  test("pointer Clear search restores all contacts and returns focus to the search field", async () => {
    const user = userEvent.setup();
    const { router, requests } = await renderContacts(
      "/workspaces/ws-1/contacts?q=Grace&page=3&sort=surname&tag=canvass&tag=volunteer",
    );
    const input = screen.getByRole("textbox", { name: "Search contacts" });
    expect(
      screen.queryByRole("link", { name: "Edit Ada Lovelace" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear search" }));

    await expectClearedSearch(router, requests, input);
  });

  test.each(["{Enter}", " "])(
    "keyboard %s activates Clear search and restores search focus",
    async (key) => {
      const user = userEvent.setup();
      const { router, requests } = await renderContacts(
        "/workspaces/ws-1/contacts?q=Grace&page=3&sort=surname&tag=canvass&tag=volunteer",
      );
      const input = screen.getByRole("textbox", { name: "Search contacts" });
      await user.click(input);
      await user.tab();
      expect(
        screen.getByRole("button", { name: "Clear search" }),
      ).toHaveFocus();

      await user.keyboard(key);

      await expectClearedSearch(router, requests, input);
    },
  );
});
