import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createMemoryRouter, RouterProvider, useLoaderData } from "react-router";

import { AudienceTable } from "@/components/audience/AudienceTable";
import type { ContactListRow } from "@/lib/contacts-loader.types";

vi.hoisted(() => {
  process.env.TZ = "UTC";
});

function contact(id: number, fields: Partial<ContactListRow> = {}): ContactListRow {
  return {
    id,
    firstname: null,
    surname: null,
    phone: "",
    email: null,
    address: null,
    city: null,
    other_data: null,
    created_at: "2026-10-15T12:00:00Z",
    ...fields,
  };
}

const identities = [
  contact(11, { firstname: " Ada ", surname: " Lovelace " }),
  contact(12, { firstname: "Ada", surname: "Lovelace" }),
  contact(13, { surname: "Hopper" }),
  contact(14, { firstname: " ", phone: "+15551234567" }),
  contact(15, { surname: " ", email: "caller@example.com" }),
  contact(16, { firstname: " ", surname: " " }),
];
const pagedContacts = Array.from({ length: 31 }, (_, index) =>
  contact(index + 101, { firstname: "Caller", surname: String(index + 101) }),
);

type ListData = {
  contacts: Array<{ contact: ContactListRow }>;
  pagination: { currentPage: number; pageSize: number; totalCount: number };
};

function CallListFixture() {
  const data = useLoaderData<ListData>();
  const [name, setName] = useState("North");
  return (
    <AudienceTable
      {...data}
      workspace_id="ws-1"
      selected_id="32"
      name={name}
      onNameChange={setName}
      sorting={{ sortKey: "surname", sortDirection: "desc" }}
    />
  );
}

const routers: Array<ReturnType<typeof createMemoryRouter>> = [];
afterEach(() => {
  for (const router of routers.splice(0)) router.dispose();
});

async function renderList(
  rows = identities,
  entry = "/workspaces/ws-1/audiences/32?page=1&pageSize=10",
) {
  const writes: Array<{ method: string; audience: FormDataEntryValue | null; ids: FormDataEntryValue[] }> = [];
  const requests: URL[] = [];
  let storedRows = rows;
  const router = createMemoryRouter([
    {
      path: "/workspaces/:workspaceId/audiences/:audienceId",
      Component: CallListFixture,
      loader: ({ request }): ListData => {
        const url = new URL(request.url);
        requests.push(url);
        const currentPage = Number(url.searchParams.get("page") ?? 1);
        const pageSize = Number(url.searchParams.get("pageSize") ?? 10);
        const q = url.searchParams.get("q")?.toLowerCase() ?? "";
        const matching = storedRows.filter((row) =>
          [row.firstname, row.surname, row.email, row.phone].some((value) => value?.toLowerCase().includes(q)),
        );
        return {
          contacts: matching.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((row) => ({ contact: row })),
          pagination: { currentPage, pageSize, totalCount: matching.length },
        };
      },
    },
    {
      path: "/api/contact-audience/bulk-delete",
      action: async ({ request }) => {
        const form = await request.formData();
        const ids = form.getAll("contact_ids[]");
        writes.push({ method: request.method, audience: form.get("audience_id"), ids });
        storedRows = storedRows.filter((row) => !ids.includes(String(row.id)));
        return {};
      },
    },
  ], { initialEntries: [entry] });
  routers.push(router);
  render(<RouterProvider router={router} />);
  await screen.findByRole("button", { name: "Save", exact: true });
  return { router, writes, requests };
}

const headerName = "Select all contacts shown on this page";

describe("Call list selection controls (#2638)", () => {
  test("names each contact, including duplicates and missing names", async () => {
    await renderList();
    expect(screen.getByRole("checkbox", { name: headerName })).not.toBeChecked();
    for (const name of [
      "Select Ada Lovelace, contact 11",
      "Select Ada Lovelace, contact 12",
      "Select Hopper, contact 13",
      "Select +15551234567, contact 14",
      "Select caller@example.com, contact 15",
      "Select contact 16",
    ]) {
      expect(screen.getByRole("checkbox", { name, exact: true })).toHaveAccessibleName(name);
    }
    expect(screen.getAllByRole("checkbox")).toHaveLength(7);
    expect(screen.getByRole("combobox", { name: "Rows per page" })).toHaveTextContent("10 per page");
  });

  test("Space exposes row, mixed and full-page selection states without losing focus", async () => {
    const user = userEvent.setup();
    await renderList();
    const header = screen.getByRole("checkbox", { name: headerName });
    const row = screen.getByRole("checkbox", { name: "Select contact 16" });
    row.focus();
    await user.keyboard(" ");
    expect(row).toBeChecked();
    expect(row).toHaveFocus();
    expect(header).toBePartiallyChecked();
    expect(screen.getByRole("button", { name: "Remove Selected (1)" })).toBeEnabled();

    header.focus();
    await user.keyboard(" ");
    expect(header).toBeChecked();
    expect(header).toHaveFocus();
    for (const checkbox of screen.getAllByRole("checkbox")) expect(checkbox).toBeChecked();
    expect(screen.getByRole("button", { name: "Remove Selected (6)" })).toBeEnabled();

    await user.keyboard(" ");
    for (const checkbox of screen.getAllByRole("checkbox")) expect(checkbox).not.toBeChecked();
    expect(screen.queryByRole("button", { name: /Remove Selected/ })).not.toBeInTheDocument();
  });

  test("bulk removal submits the chosen contact IDs for duplicate and unnamed contacts", async () => {
    const user = userEvent.setup();
    const { router, writes } = await renderList();
    await user.click(screen.getByRole("checkbox", { name: "Select Ada Lovelace, contact 12" }));
    await user.click(screen.getByRole("checkbox", { name: "Select contact 16" }));
    await user.click(screen.getByRole("button", { name: "Remove Selected (2)" }));
    await waitFor(() => expect(writes).toEqual([{ method: "DELETE", audience: "32", ids: ["12", "16"] }]));
    await waitFor(() => expect([...router.state.fetchers.values()].every((fetcher) => fetcher.state === "idle")).toBe(true));
    expect(screen.queryByRole("checkbox", { name: "Select Ada Lovelace, contact 12" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Select contact 16" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select Ada Lovelace, contact 11" })).not.toBeChecked();
  });

  test("Select all uses the visible filter and clears selection on paging", async () => {
    const user = userEvent.setup();
    const { router } = await renderList(pagedContacts);
    await user.type(screen.getByPlaceholderText("Search contacts..."), "101");
    await user.click(screen.getByRole("checkbox", { name: headerName }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Remove Selected (1)" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Clear contact search" }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(11);
    expect(screen.queryByRole("button", { name: /Remove Selected/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: headerName }));
    expect(screen.getByRole("button", { name: "Remove Selected (10)" })).toBeEnabled();
    const next = screen.getByRole("button", { name: "Go to next page" });
    next.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("checkbox", { name: "Select Caller 111, contact 111" });
    expect(new URLSearchParams(router.state.location.search).get("page")).toBe("2");
    expect(screen.getByRole("checkbox", { name: headerName })).not.toBeChecked();
    expect(screen.queryByRole("button", { name: /Remove Selected/ })).not.toBeInTheDocument();
  });

  test("keyboard page-size change resets the page in one navigation and retains the query and sort", async () => {
    const user = userEvent.setup();
    const { router, requests } = await renderList(
      pagedContacts,
      "/workspaces/ws-1/audiences/32?page=2&pageSize=10&q=Caller&sortKey=surname&sortDirection=desc&tag=north&tag=volunteer",
    );
    await user.click(screen.getByRole("checkbox", { name: headerName }));
    const size = screen.getByRole("combobox", { name: "Rows per page" });
    const id = size.id;
    size.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("option", { name: "25 per page" });
    await user.keyboard("{ArrowDown}{Enter}");
    await screen.findByRole("checkbox", { name: "Select Caller 101, contact 101" });
    await waitFor(() => expect(router.state.navigation.state).toBe("idle"));
    const params = new URLSearchParams(router.state.location.search);
    expect(params.get("pageSize")).toBe("25");
    expect(params.get("page")).toBe("1");
    expect(params.get("q")).toBe("Caller");
    expect(params.get("sortKey")).toBe("surname");
    expect(params.get("sortDirection")).toBe("desc");
    expect(params.getAll("tag")).toEqual(["north", "volunteer"]);
    expect(requests).toHaveLength(2);
    expect(requests[1]?.searchParams.get("pageSize")).toBe("25");
    expect(screen.getAllByRole("checkbox")).toHaveLength(26);
    expect(screen.getByRole("combobox", { name: "Rows per page" })).toHaveAttribute("id", id);
    expect(size).toHaveFocus();
    expect(size).toHaveTextContent("25 per page");
    expect(screen.getByRole("checkbox", { name: headerName })).not.toBeChecked();
    expect(screen.queryByRole("button", { name: /Remove Selected/ })).not.toBeInTheDocument();
  });

  test("empty results keep an unchecked named page header and working page-size control", async () => {
    const user = userEvent.setup();
    await renderList([]);
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: headerName })).not.toBeChecked();
    const size = screen.getByRole("combobox", { name: "Rows per page" });
    await user.click(size);
    for (const count of [10, 25, 50, 100]) {
      expect(screen.getByRole("option", { name: `${count} per page` })).toBeInTheDocument();
    }
    await user.keyboard("{Escape}");
    expect(size).toHaveFocus();
  });
});
