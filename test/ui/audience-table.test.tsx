import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const submit = vi.fn();
  const setSearchParams = vi.fn();
  const saveSnapshot = vi.fn();
  const loggerError = vi.fn();
  return { submit, setSearchParams, saveSnapshot, loggerError };
});

vi.mock("@remix-run/react", () => ({
  useFetcher: () => ({ submit: mocks.submit }),
  useSearchParams: () => [new URLSearchParams("page=2&pageSize=10"), mocks.setSearchParams],
}));

vi.mock("@/hooks/utils/useOptimisticMutation", () => ({
  useOptimisticCollection: (opts: any) => {
    // exercise isError predicate branches for coverage
    opts?.isError?.(null);
    opts?.isError?.("nope");
    opts?.isError?.({});
    opts?.isError?.({ error: "" });
    opts?.isError?.({ error: "boom" });
    return { saveSnapshot: mocks.saveSnapshot };
  },
}));

vi.mock("@/components/audience/AudienceForm", () => ({
  AudienceForm: ({ audienceInfo, handleSaveAudience }: any) => (
    <form onSubmit={handleSaveAudience}>
      <div data-testid="audience-name">{audienceInfo?.name ?? ""}</div>
      <input name="name" defaultValue="New Name" />
      <button type="submit">Save Audience</button>
    </form>
  ),
}));

vi.mock("@/components/shared/TablePagination", () => ({
  default: ({ currentPage, totalPages, onPageChange }: any) => (
    <div>
      <div data-testid="page">{`${currentPage}/${totalPages}`}</div>
      <button type="button" onClick={() => onPageChange(currentPage + 1)}>
        NextPage
      </button>
    </div>
  ),
}));

vi.mock("@/lib/logger.client", () => ({
  logger: { error: (...args: any[]) => mocks.loggerError(...args) },
}));

vi.mock("lucide-react", () => ({
  Download: (p: any) => <span data-icon="Download" {...p} />,
  Search: (p: any) => <span data-icon="Search" {...p} />,
  X: (p: any) => <span data-icon="X" {...p} />,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ checked, onCheckedChange }: any) => (
    <input
      aria-label="checkbox"
      type="checkbox"
      checked={Boolean(checked)}
      onChange={(e) => onCheckedChange(e.target.checked)}
    />
  ),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children, onValueChange, value }: any) => (
    <div data-testid="select" data-value={value}>
      <button type="button" onClick={() => onValueChange?.("25")}>
        set-25
      </button>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ value, children }: any) => <div data-value={value}>{children}</div>,
}));

vi.mock("@/components/ui/table", () => ({
  Table: ({ children }: any) => <table>{children}</table>,
  TableHeader: ({ children }: any) => <thead>{children}</thead>,
  TableBody: ({ children }: any) => <tbody>{children}</tbody>,
  TableRow: ({ children, ...props }: any) => <tr {...props}>{children}</tr>,
  TableHead: ({ children, ...props }: any) => <th {...props}>{children}</th>,
  TableCell: ({ children, ...props }: any) => <td {...props}>{children}</td>,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, asChild }: any) =>
    asChild ? (
      <div>{children}</div>
    ) : (
      <button type="button" onClick={onClick}>
        {children}
      </button>
    ),
  DropdownMenuLabel: ({ children }: any) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

function makeContact(id: number, overrides: Partial<any> = {}) {
  return {
    id,
    firstname: "Ada",
    surname: "Lovelace",
    phone: "123",
    email: "a@b.com",
    address: "1 Main",
    city: "City",
    ...overrides,
  } as any;
}

describe("app/components/audience/AudienceTable.tsx", () => {
  beforeEach(() => {
    mocks.submit.mockReset();
    mocks.setSearchParams.mockReset();
    mocks.saveSnapshot.mockReset();
    mocks.loggerError.mockReset();
    vi.unstubAllGlobals();
  });

  test("renders empty state (no search) and export early-returns without audience_id", async () => {
    const { AudienceTable } = await import("@/components/audience/AudienceTable");
    render(
      <AudienceTable
        contacts={null}
        workspace_id="w1"
        selected_id={undefined}
        audience={null}
        pagination={{ currentPage: 1, pageSize: 10, totalCount: 0 }}
        sorting={{ sortKey: "id", sortDirection: "asc" }}
      />,
    );

    expect(screen.getByText("No contacts in this audience yet")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /export csv/i }));
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  test("search filters, shows clear button, and shows empty search-result state", async () => {
    const { AudienceTable } = await import("@/components/audience/AudienceTable");
    const { container } = render(
      <AudienceTable
        contacts={[
          { contact: makeContact(1, { firstname: null, surname: null, email: null }) },
          { contact: makeContact(2, { firstname: "Bob", phone: "555" }) },
        ]}
        workspace_id="w1"
        selected_id="a1"
        audience={{ id: "a1", name: "Audience A" } as any}
        pagination={{ currentPage: 1, pageSize: 10, totalCount: 2 }}
        sorting={{ sortKey: "id", sortDirection: "asc" }}
      />,
    );

    expect(screen.getByText("Bob")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search contacts..."), {
      target: { value: "nomatch" },
    });
    expect(screen.getByText("No contacts found matching your search")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search contacts..."), {
      target: { value: "bob" },
    });
    expect(screen.getByText("Bob")).toBeInTheDocument();

    fireEvent.click(
      (container.querySelector('[data-icon="X"]') as HTMLElement).closest("button") as HTMLButtonElement,
    );
    expect(screen.getByText("Showing 2 of 2 contacts")).toBeInTheDocument();
  });

  test("remove contact uses optimistic snapshot, updates state, and submits DELETE form", async () => {
    const { AudienceTable } = await import("@/components/audience/AudienceTable");
    render(
      <AudienceTable
        contacts={[
          { contact: makeContact(1, { firstname: "First" }) },
          { contact: makeContact(2, { firstname: "Second" }) },
        ]}
        workspace_id="w1"
        selected_id="a1"
        audience={{ id: "a1", name: "Audience A" } as any}
        pagination={{ currentPage: 1, pageSize: 10, totalCount: 2 }}
        sorting={{ sortKey: "id", sortDirection: "asc" }}
      />,
    );

    fireEvent.click(screen.getAllByText("Remove from Audience")[0]);
    expect(mocks.saveSnapshot).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("First")).toBeNull();
    expect(screen.getByText("Second")).toBeInTheDocument();

    const [fd, opts] = mocks.submit.mock.calls[0];
    expect(opts).toEqual({ action: "/api/contact-audience", method: "DELETE" });
    expect(fd.get("contact_id")).toBe("1");
    expect(fd.get("audience_id")).toBe("a1");
  });

  test("remove contact/selected includes empty audience_id when selected_id missing", async () => {
    const { AudienceTable } = await import("@/components/audience/AudienceTable");
    const { unmount } = render(
      <AudienceTable
        contacts={[{ contact: makeContact(1, { firstname: "First" }) }]}
        workspace_id="w1"
        selected_id={undefined}
        audience={null}
        pagination={{ currentPage: 1, pageSize: 10, totalCount: 1 }}
        sorting={{ sortKey: "id", sortDirection: "asc" }}
      />,
    );

    fireEvent.click(screen.getByText("Remove from Audience"));
    let [fd, opts] = mocks.submit.mock.calls.at(-1)!;
    expect(opts).toEqual({ action: "/api/contact-audience", method: "DELETE" });
    expect(fd.get("audience_id")).toBe("");

    unmount();
    render(
      <AudienceTable
        contacts={[{ contact: makeContact(1, { firstname: "First" }) }]}
        workspace_id="w1"
        selected_id={undefined}
        audience={null}
        pagination={{ currentPage: 1, pageSize: 10, totalCount: 1 }}
        sorting={{ sortKey: "id", sortDirection: "asc" }}
      />,
    );

    const checkboxes = screen.getAllByLabelText("checkbox");
    fireEvent.click(checkboxes[0]); // select all
    fireEvent.click(screen.getByRole("button", { name: "Remove Selected (1)" }));
    [fd, opts] = mocks.submit.mock.calls.at(-1)!;
    expect(opts).toEqual({ action: "/api/contact-audience/bulk-delete", method: "DELETE" });
    expect(fd.get("audience_id")).toBe("");
  });

  test("select all -> remove selected submits bulk delete and clears selection", async () => {
    const { AudienceTable } = await import("@/components/audience/AudienceTable");
    render(
      <AudienceTable
        contacts={[{ contact: makeContact(1) }, { contact: makeContact(2) }]}
        workspace_id="w1"
        selected_id="a1"
        audience={{ id: "a1", name: "Audience A" } as any}
        pagination={{ currentPage: 1, pageSize: 10, totalCount: 2 }}
        sorting={{ sortKey: "id", sortDirection: "asc" }}
      />,
    );

    const checkboxes = screen.getAllByLabelText("checkbox");
    fireEvent.click(checkboxes[0]);
    expect(screen.getByRole("button", { name: "Remove Selected (2)" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove Selected (2)" }));
    const [, opts] = mocks.submit.mock.calls.at(-1)!;
    expect(opts).toEqual({ action: "/api/contact-audience/bulk-delete", method: "DELETE" });
    expect(screen.getByText("No contacts in this audience yet")).toBeInTheDocument();
    expect(screen.queryByText("Remove Selected (2)")).toBeNull();
  });

  test("row checkbox toggles selectedContacts and select-all can be unchecked", async () => {
    const { AudienceTable } = await import("@/components/audience/AudienceTable");
    render(
      <AudienceTable
        contacts={[{ contact: makeContact(1, { firstname: "First" }) }, { contact: makeContact(2, { firstname: "Second" }) }]}
        workspace_id="w1"
        selected_id="a1"
        audience={{ id: "a1", name: "Audience A" } as any}
        pagination={{ currentPage: 1, pageSize: 10, totalCount: 2 }}
        sorting={{ sortKey: "id", sortDirection: "asc" }}
      />,
    );

    const checkboxes = screen.getAllByLabelText("checkbox");
    // select a single row
    fireEvent.click(checkboxes[1]);
    expect(screen.getByRole("button", { name: "Remove Selected (1)" })).toBeInTheDocument();

    // deselect that row
    fireEvent.click(checkboxes[1]);
    expect(screen.queryByText("Remove Selected (1)")).toBeNull();

    // select-all then unselect-all (covers handleSelectAll false branch)
    fireEvent.click(checkboxes[0]);
    expect(screen.getByRole("button", { name: "Remove Selected (2)" })).toBeInTheDocument();
    fireEvent.click(checkboxes[0]);
    expect(screen.queryByText("Remove Selected (2)")).toBeNull();
  });

  test("renders sort arrows for non-id columns and clicking headers sets new sortKey", async () => {
    const { AudienceTable } = await import("@/components/audience/AudienceTable");
    render(
      <AudienceTable
        contacts={[{ contact: makeContact(1) }]}
        workspace_id="w1"
        selected_id="a1"
        audience={{ id: "a1", name: "Audience A" } as any}
        pagination={{ currentPage: 1, pageSize: 10, totalCount: 1 }}
        sorting={{ sortKey: "surname", sortDirection: "desc" }}
      />,
    );

    expect(screen.getByText(/Last Name.*↓/)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/^Phone/));
    const params = mocks.setSearchParams.mock.calls.at(-1)![0] as URLSearchParams;
    expect(params.get("sortKey")).toBe("phone");
    expect(params.get("sortDirection")).toBe("asc");
  });

  test("clicks remaining sortable headers (surname/email/address/city)", async () => {
    const { AudienceTable } = await import("@/components/audience/AudienceTable");
    render(
      <AudienceTable
        contacts={[{ contact: makeContact(1) }]}
        workspace_id="w1"
        selected_id="a1"
        audience={{ id: "a1", name: "Audience A" } as any}
        pagination={{ currentPage: 1, pageSize: 10, totalCount: 1 }}
        sorting={{ sortKey: "id", sortDirection: "asc" }}
      />,
    );

    fireEvent.click(screen.getByText(/^Last Name/));
    fireEvent.click(screen.getByText(/^Email/));
    fireEvent.click(screen.getByText(/^Address/));
    fireEvent.click(screen.getByRole("columnheader", { name: /^City/ }));

    expect(mocks.setSearchParams).toHaveBeenCalled();
  });

  test("sorting toggles direction for same key and sets new key/direction for different key", async () => {
    const { AudienceTable } = await import("@/components/audience/AudienceTable");
    render(
      <AudienceTable
        contacts={[{ contact: makeContact(1) }]}
        workspace_id="w1"
        selected_id="a1"
        audience={{ id: "a1", name: "Audience A" } as any}
        pagination={{ currentPage: 2, pageSize: 10, totalCount: 1 }}
        sorting={{ sortKey: "id", sortDirection: "asc" }}
      />,
    );

    fireEvent.click(screen.getByText(/^ID/));
    let params = mocks.setSearchParams.mock.calls[0][0] as URLSearchParams;
    expect(params.get("sortDirection")).toBe("desc");
    expect(params.get("page")).toBe("1");

    fireEvent.click(screen.getByText(/^First Name/));
    params = mocks.setSearchParams.mock.calls.at(-1)![0] as URLSearchParams;
    expect(params.get("sortKey")).toBe("firstname");
    expect(params.get("sortDirection")).toBe("asc");
    expect(params.get("page")).toBe("1");
  });

  test("sorting toggles desc -> asc when already sorting by key", async () => {
    const { AudienceTable } = await import("@/components/audience/AudienceTable");
    render(
      <AudienceTable
        contacts={[{ contact: makeContact(1) }]}
        workspace_id="w1"
        selected_id="a1"
        audience={{ id: "a1", name: "Audience A" } as any}
        pagination={{ currentPage: 2, pageSize: 10, totalCount: 1 }}
        sorting={{ sortKey: "id", sortDirection: "desc" }}
      />,
    );

    fireEvent.click(screen.getByText(/^ID/));
    const params = mocks.setSearchParams.mock.calls.at(-1)![0] as URLSearchParams;
    expect(params.get("sortDirection")).toBe("asc");
    expect(params.get("page")).toBe("1");
  });

  test("renders sort arrows for each column key", async () => {
    const { AudienceTable } = await import("@/components/audience/AudienceTable");
    const baseProps = {
      contacts: [{ contact: makeContact(1) }],
      workspace_id: "w1",
      selected_id: "a1",
      audience: { id: "a1", name: "Audience A" } as any,
      pagination: { currentPage: 1, pageSize: 10, totalCount: 1 },
    };

    const { rerender } = render(
      <AudienceTable {...(baseProps as any)} sorting={{ sortKey: "firstname", sortDirection: "asc" }} />,
    );
    expect(screen.getByText(/First Name.*↑/)).toBeInTheDocument();
    rerender(<AudienceTable {...(baseProps as any)} sorting={{ sortKey: "firstname", sortDirection: "desc" }} />);
    expect(screen.getByText(/First Name.*↓/)).toBeInTheDocument();

    rerender(<AudienceTable {...(baseProps as any)} sorting={{ sortKey: "surname", sortDirection: "desc" }} />);
    expect(screen.getByText(/Last Name.*↓/)).toBeInTheDocument();
    rerender(<AudienceTable {...(baseProps as any)} sorting={{ sortKey: "surname", sortDirection: "asc" }} />);
    expect(screen.getByText(/Last Name.*↑/)).toBeInTheDocument();

    rerender(<AudienceTable {...(baseProps as any)} sorting={{ sortKey: "phone", sortDirection: "asc" }} />);
    expect(screen.getByText(/Phone.*↑/)).toBeInTheDocument();
    rerender(<AudienceTable {...(baseProps as any)} sorting={{ sortKey: "phone", sortDirection: "desc" }} />);
    expect(screen.getByText(/Phone.*↓/)).toBeInTheDocument();

    rerender(<AudienceTable {...(baseProps as any)} sorting={{ sortKey: "email", sortDirection: "desc" }} />);
    expect(screen.getByText(/Email.*↓/)).toBeInTheDocument();
    rerender(<AudienceTable {...(baseProps as any)} sorting={{ sortKey: "email", sortDirection: "asc" }} />);
    expect(screen.getByText(/Email.*↑/)).toBeInTheDocument();

    rerender(<AudienceTable {...(baseProps as any)} sorting={{ sortKey: "address", sortDirection: "asc" }} />);
    expect(screen.getByText(/Address.*↑/)).toBeInTheDocument();
    rerender(<AudienceTable {...(baseProps as any)} sorting={{ sortKey: "address", sortDirection: "desc" }} />);
    expect(screen.getByText(/Address.*↓/)).toBeInTheDocument();

    rerender(<AudienceTable {...(baseProps as any)} sorting={{ sortKey: "city", sortDirection: "desc" }} />);
    expect(screen.getByText(/City.*↓/)).toBeInTheDocument();
    rerender(<AudienceTable {...(baseProps as any)} sorting={{ sortKey: "city", sortDirection: "asc" }} />);
    expect(screen.getByText(/City.*↑/)).toBeInTheDocument();
  });

  test("page change and page size change update search params", async () => {
    const { AudienceTable } = await import("@/components/audience/AudienceTable");
    render(
      <AudienceTable
        contacts={[{ contact: makeContact(1) }]}
        workspace_id="w1"
        selected_id="a1"
        audience={{ id: "a1", name: "Audience A" } as any}
        pagination={{ currentPage: 2, pageSize: 10, totalCount: 30 }}
        sorting={{ sortKey: "id", sortDirection: "asc" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "NextPage" }));
    const pageParams = mocks.setSearchParams.mock.calls[0][0] as URLSearchParams;
    expect(pageParams.get("page")).toBe("3");

    fireEvent.click(screen.getByRole("button", { name: "set-25" }));
    const sizeParams = mocks.setSearchParams.mock.calls.at(-1)![0] as URLSearchParams;
    expect(sizeParams.get("page")).toBe("1");
    expect(sizeParams.get("pageSize")).toBe("25");
  });

  test("export CSV builds a link with sort and optional trimmed q", async () => {
    const { AudienceTable } = await import("@/components/audience/AudienceTable");

    const realCreateElement = document.createElement.bind(document);
    const anchor = document.createElement("a");
    const click = vi.fn();
    (anchor as any).click = click;
    const createElementSpy = vi.spyOn(document, "createElement").mockImplementation((tag: any) => {
      if (tag === "a") return anchor as any;
      return realCreateElement(tag);
    });
    const appendSpy = vi.spyOn(document.body, "appendChild");
    const removeSpy = vi.spyOn(document.body, "removeChild");

    render(
      <AudienceTable
        contacts={[{ contact: makeContact(1, { firstname: "Bob" }) }]}
        workspace_id="w1"
        selected_id="a1"
        audience={{ id: "a1", name: "Audience A" } as any}
        pagination={{ currentPage: 1, pageSize: 10, totalCount: 1 }}
        sorting={{ sortKey: "surname", sortDirection: "desc" }}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Search contacts..."), {
      target: { value: "  bob " },
    });

    fireEvent.click(screen.getByRole("button", { name: /export csv/i }));

    expect(appendSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();
    expect(click).toHaveBeenCalledTimes(1);
    expect(anchor.href).toContain("returnType=csv");
    expect(anchor.href).toContain("audienceId=a1");
    expect(anchor.href).toContain("sortKey=surname");
    expect(anchor.href).toContain("sortDirection=desc");
    expect(anchor.href).toContain("q=bob");

    createElementSpy.mockRestore();
  });

  test("export CSV omits q when searchTerm blank", async () => {
    const { AudienceTable } = await import("@/components/audience/AudienceTable");

    const realCreateElement = document.createElement.bind(document);
    const anchor = document.createElement("a");
    (anchor as any).click = vi.fn();
    const createElementSpy = vi.spyOn(document, "createElement").mockImplementation((tag: any) => {
      if (tag === "a") return anchor as any;
      return realCreateElement(tag);
    });

    render(
      <AudienceTable
        contacts={[{ contact: makeContact(1) }]}
        workspace_id="w1"
        selected_id="a1"
        audience={{ id: "a1", name: "Audience A" } as any}
        pagination={{ currentPage: 1, pageSize: 10, totalCount: 1 }}
        sorting={{ sortKey: "id", sortDirection: "asc" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /export csv/i }));
    expect(anchor.href).toContain("audienceId=a1");
    expect(anchor.href).not.toContain("q=");

    createElementSpy.mockRestore();
  });

  test("save audience updates state on ok, logs on failure", async () => {
    const { AudienceTable } = await import("@/components/audience/AudienceTable");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "a1", name: "Saved" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "nope" }),
      });
    vi.stubGlobal("fetch", fetchMock as any);

    render(
      <AudienceTable
        contacts={[]}
        workspace_id="w1"
        selected_id="a1"
        audience={{ id: "a1", name: "Audience A" } as any}
        pagination={{ currentPage: 1, pageSize: 10, totalCount: 0 }}
        sorting={{ sortKey: "id", sortDirection: "asc" }}
      />,
    );

    fireEvent.submit(screen.getByRole("button", { name: "Save Audience" }).closest("form") as HTMLFormElement);
    expect(await screen.findByText("Saved")).toBeInTheDocument();

    fireEvent.submit(screen.getByRole("button", { name: "Save Audience" }).closest("form") as HTMLFormElement);
    await waitFor(() =>
      expect(mocks.loggerError).toHaveBeenCalledWith("Failed to save audience", { error: "nope" }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

