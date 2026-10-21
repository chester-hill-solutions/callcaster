import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import { DataTable } from "@/components/workspace/tables/DataTable";
import { audienceColumns } from "@/components/workspace/tables/columns";
import type { Audience } from "@/lib/types";

const routers: Array<ReturnType<typeof createMemoryRouter>> = [];
const originalUrlMethods = [
  ["createObjectURL", Object.getOwnPropertyDescriptor(URL, "createObjectURL")],
  ["revokeObjectURL", Object.getOwnPropertyDescriptor(URL, "revokeObjectURL")],
] as const;

afterEach(() => {
  for (const router of routers.splice(0)) router.dispose();
  for (const [name, descriptor] of originalUrlMethods) {
    if (descriptor) Object.defineProperty(URL, name, descriptor);
    else Reflect.deleteProperty(URL, name);
  }
});

function callList(id: number, name: string | null): Audience {
  return {
    id,
    name,
    created_at: "2026-10-15T12:00:00Z",
    workspace: "11111111-1111-4111-8111-111111111111",
    is_conditional: false,
    status: "ready",
    total_contacts: 2,
    processed_contacts: 2,
    processed_at: null,
    error_message: null,
  };
}

function renderCallLists() {
  const writes: Array<{ method: string; id: FormDataEntryValue | null }> = [];
  const router = createMemoryRouter([
    {
      path: "/workspaces/:workspaceId/audiences",
      element: <DataTable
        columns={audienceColumns}
        data={[
          callList(32, "North"),
          callList(33, "South"),
          callList(34, "North"),
          callList(35, null),
          callList(36, ""),
        ]}
      />,
    },
    {
      path: "/workspaces/:workspaceId/audiences/:audienceId",
      element: <p>Call list editor</p>,
    },
    {
      path: "/api/audiences",
      action: async ({ request }) => {
        const form = await request.formData();
        writes.push({ method: request.method, id: form.get("id") });
        return { success: true };
      },
    },
  ], { initialEntries: ["/workspaces/ws-1/audiences"] });
  routers.push(router);
  render(<RouterProvider router={router} />);
  return { router, writes };
}

function captureDownload() {
  const blobs: Blob[] = [];
  const anchors: Array<{ href: string; filename: string }> = [];
  const createUrl = vi.fn((blob: Blob) => {
    blobs.push(blob);
    return "blob:call-list-download";
  });
  const revokeUrl = vi.fn();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createUrl });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeUrl });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    anchors.push({ href: this.href, filename: this.download });
  });
  return { blobs, anchors, createUrl, revokeUrl };
}

async function downloadedText(blob: Blob | undefined) {
  if (!blob) throw new Error("Expected a downloaded CSV blob.");
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe("Call list index row actions (#2647)", () => {
  test("names every action distinctly for named, duplicate and unnamed lists", () => {
    renderCallLists();
    const targets = [
      "North (Call list 32)",
      "South (Call list 33)",
      "North (Call list 34)",
      "Unnamed Call list (Call list 35)",
      "Unnamed Call list (Call list 36)",
    ];
    for (const target of targets) {
      for (const action of ["Edit", "Download", "Delete"]) {
        const name = `${action} ${target}`;
        const control = screen.getByRole(action === "Edit" ? "link" : "button", { name });
        expect(control).toHaveAccessibleName(name);
        expect(control.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
      }
    }
    expect(screen.getAllByText("Unnamed Call list")).toHaveLength(2);
    expect(within(screen.getByRole("table")).getAllByRole("link")).toHaveLength(5);
  });

  test("keeps row actions in keyboard order", async () => {
    const user = userEvent.setup();
    renderCallLists();
    for (const name of [
      "Edit North (Call list 32)",
      "Download North (Call list 32)",
      "Delete North (Call list 32)",
      "Edit South (Call list 33)",
      "Download South (Call list 33)",
      "Delete South (Call list 33)",
    ]) {
      await user.tab();
      expect(screen.getByRole(name.startsWith("Edit") ? "link" : "button", { name })).toHaveFocus();
    }
  });

  test("keyboard Edit opens the selected Call list destination", async () => {
    const user = userEvent.setup();
    const { router } = renderCallLists();
    const edit = screen.getByRole("link", { name: "Edit South (Call list 33)" });
    expect(edit).toHaveAttribute("href", "/workspaces/ws-1/audiences/33");
    edit.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByText("Call list editor")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/workspaces/ws-1/audiences/33");
  });

  test("Download retrieves the selected list and saves its CSV", async () => {
    const user = userEvent.setup();
    const csv = "firstname,phone\r\nSouth Person,+15551234567\r\n";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(csv));
    const download = captureDownload();
    renderCallLists();
    await user.click(screen.getByRole("button", { name: "Download South (Call list 33)" }));
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "/api/audiences?audienceId=33&returnType=csv",
      { credentials: "include" },
    );
    await waitFor(() => expect(download.createUrl).toHaveBeenCalledTimes(1));
    expect(await downloadedText(download.blobs[0])).toBe(csv);
    expect(download.blobs[0]?.type).toBe("text/csv;charset=utf-8");
    expect(download.anchors).toEqual([{ href: "blob:call-list-download", filename: "audiences.csv" }]);
    expect(download.revokeUrl).toHaveBeenCalledExactlyOnceWith("blob:call-list-download");
  });

  test("a failed Download does not save a CSV", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Unavailable", { status: 503 }));
    const download = captureDownload();
    renderCallLists();
    await user.click(screen.getByRole("button", { name: "Download South (Call list 33)" }));
    expect(download.createUrl).not.toHaveBeenCalled();
    expect(download.anchors).toEqual([]);
  });

  test("Delete sends the selected ID by DELETE and stays on the index", async () => {
    const user = userEvent.setup();
    const { router, writes } = renderCallLists();
    await user.click(screen.getByRole("button", { name: "Delete South (Call list 33)" }));
    await waitFor(() => expect(writes).toEqual([{ method: "DELETE", id: "33" }]));
    expect(router.state.location.pathname).toBe("/workspaces/ws-1/audiences");
  });
});
