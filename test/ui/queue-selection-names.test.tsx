import { useState, type ComponentProps } from "react";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { QueueTable } from "@/components/queue/QueueTable";
import type { QueueItem } from "@/lib/types";
import {
  defaultQueueTableProps,
  makeContact,
  makeQueueItem,
} from "./_helpers/component-smoke";

const routers = new Set<ReturnType<typeof createMemoryRouter>>();
const pageSelectionName = "Select all contacts shown on this page";

afterEach(() => {
  for (const router of routers) router.dispose();
  routers.clear();
});

function duplicateContacts() {
  return [
    makeQueueItem({
      id: 901,
      contact_id: 11,
      queue_state: "queued",
      contact: makeContact({
        id: 11,
        firstname: " Alex ",
        surname: " Lee ",
        phone: "+15550002",
      }),
    }),
    makeQueueItem({
      id: 902,
      contact_id: 12,
      queue_state: "queued",
      contact: makeContact({
        id: 12,
        firstname: "Alex",
        surname: "Lee",
        phone: "+15550001",
      }),
    }),
  ];
}

function renderQueue(
  queue: QueueItem[],
  overrides: Partial<ComponentProps<typeof QueueTable>> = {},
) {
  const onRemove = vi.fn();
  const onStatus = vi.fn();
  const onAllFiltered = vi.fn();
  const defaults = { ...defaultQueueTableProps(), ...overrides };
  function Scene() {
    const [rows, setRows] = useState(queue);
    const [allFiltered, setAllFiltered] = useState(false);
    return (
      <>
        <button
          type="button"
          onClick={() => setRows((current) => [...current].reverse())}
        >
          Reverse source rows
        </button>
        <QueueTable
          {...defaults}
          queue={rows}
          isAllFilteredSelected={allFiltered}
          onSelectAllFiltered={(value) => {
            setAllFiltered(value);
            onAllFiltered(value);
          }}
          onStatusChange={onStatus}
          removeContactsFromQueue={onRemove}
        />
      </>
    );
  }
  const router = createMemoryRouter([{ path: "/", Component: Scene }]);
  routers.add(router);
  render(<RouterProvider router={router} />);
  return { onRemove, onStatus, onAllFiltered };
}

describe("campaign queue selection names (#2641)", () => {
  test("names duplicates and falls back through phone, email and the stored contact ID", () => {
    const duplicates = duplicateContacts();
    const rows = [
      ...duplicates,
      makeQueueItem({
        id: 903,
        contact_id: 13,
        queue_state: "queued",
        contact: makeContact({
          id: 13,
          firstname: " ",
          surname: "\t",
          phone: " +15550003 ",
          email: "unused@example.test",
        }),
      }),
      makeQueueItem({
        id: 904,
        contact_id: 14,
        queue_state: "queued",
        contact: makeContact({
          id: 14,
          firstname: null,
          surname: null,
          phone: " ",
          email: " fallback@example.test ",
        }),
      }),
      makeQueueItem({
        id: 905,
        contact_id: 15,
        queue_state: "queued",
        contact: makeContact({
          id: 15,
          firstname: "",
          surname: null,
          phone: "",
          email: null,
        }),
      }),
      makeQueueItem({
        id: 906,
        contact_id: 16,
        queue_state: "queued",
        contact: undefined,
      }),
      makeQueueItem({
        id: 907,
        contact_id: 17,
        queue_state: "queued",
        contact: makeContact({
          id: 17,
          firstname: "Alex",
          surname: "Lee",
          phone: "+15550002",
        }),
      }),
    ];
    renderQueue(rows, {
      totalCount: rows.length,
      unfilteredCount: rows.length,
    });
    for (const name of [
      "Select Alex Lee, contact 11",
      "Select Alex Lee, contact 12",
      "Select +15550003, contact 13",
      "Select fallback@example.test, contact 14",
      "Select contact 15",
      "Select contact 16",
      "Select Alex Lee, contact 17",
    ]) {
      expect(
        screen.getByRole("checkbox", { name, exact: true }),
      ).toBeInTheDocument();
    }
    expect(
      screen.queryByRole("checkbox", { name: "Select row", exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: pageSelectionName }),
    ).toBeInTheDocument();
  });
});

describe("campaign queue selection behavior (#2641)", () => {
  test("Space selects only the named duplicate and deletion receives its queue-row ID", async () => {
    const user = userEvent.setup();
    const { onRemove } = renderQueue(duplicateContacts(), {
      totalCount: 2,
      unfilteredCount: 2,
    });
    const target = screen.getByRole("checkbox", {
      name: "Select Alex Lee, contact 12",
    });
    const other = screen.getByRole("checkbox", {
      name: "Select Alex Lee, contact 11",
    });
    const row = target.closest("tr");
    if (!row) throw new Error("Expected a queue row for the selection control");
    expect(within(row).getByText("+15550001")).toBeInTheDocument();
    act(() => target.focus());
    await user.keyboard("[Space]");
    expect(target).toBeChecked();
    expect(other).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: pageSelectionName }),
    ).not.toBeChecked();
    expect(screen.getByText("Selected: 1 of 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete 1" }));
    expect(onRemove).toHaveBeenCalledExactlyOnceWith(["902"]);
    expect(
      screen.queryByRole("checkbox", { name: "Select Alex Lee, contact 12" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Select Alex Lee, contact 11" }),
    ).toBeInTheDocument();
  });

  test("sorting and new source order retain contact identity and the selected status target", async () => {
    const user = userEvent.setup();
    const { onStatus } = renderQueue(duplicateContacts(), {
      totalCount: 2,
      unfilteredCount: 2,
    });
    await user.click(screen.getByRole("button", { name: "Sort by Phone" }));
    await user.click(
      screen.getByRole("button", { name: "Reverse source rows" }),
    );
    const sortedControls = screen.getAllByRole("checkbox", {
      name: /^Select Alex Lee/,
    });
    expect(sortedControls).toHaveLength(2);
    expect(sortedControls.at(0)).toHaveAccessibleName(
      "Select Alex Lee, contact 12",
    );
    expect(sortedControls.at(1)).toHaveAccessibleName(
      "Select Alex Lee, contact 11",
    );
    const target = screen.getByRole("checkbox", {
      name: "Select Alex Lee, contact 11",
    });
    act(() => target.focus());
    await user.keyboard("[Space]");
    expect(target).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Select Alex Lee, contact 12" }),
    ).not.toBeChecked();
    await user.click(
      screen.getByRole("combobox", {
        name: "Set status for selected contacts",
      }),
    );
    await user.click(
      screen.getByRole("option", { name: "dequeued", exact: true }),
    );
    expect(onStatus).toHaveBeenCalledExactlyOnceWith(["901"], "dequeued");
  });

  test.each(["page", "filtered"])(
    "%s selection keeps its scope when filters and off-page matches exist",
    async (scope) => {
      const user = userEvent.setup();
      const { onRemove, onAllFiltered } = renderQueue(duplicateContacts(), {
        totalCount: 5,
        unfilteredCount: 9,
        pageSize: 2,
        defaultFilters: {
          ...defaultQueueTableProps().defaultFilters,
          name: "Alex",
        },
      });
      if (scope === "page") {
        const control = screen.getByRole("checkbox", {
          name: pageSelectionName,
        });
        const label = control.closest("label");
        if (!label)
          throw new Error("Expected the shared checkbox press surface");
        await user.click(label);
        expect(onAllFiltered).not.toHaveBeenCalledWith(true);
        expect(screen.getByText("Selected: 2 of 9")).toBeInTheDocument();
      } else {
        await user.click(
          screen.getByRole("button", { name: "Select All Filtered (5)" }),
        );
        expect(onAllFiltered).toHaveBeenCalledExactlyOnceWith(true);
        expect(screen.getByText("Selected: 5 of 9")).toBeInTheDocument();
      }
      const controls = within(
        screen.getByTestId("campaign-queue-table"),
      ).getAllByRole("checkbox");
      expect(controls).toHaveLength(3);
      for (const control of controls) expect(control).toBeChecked();
      await user.click(
        screen.getByRole("button", {
          name: scope === "page" ? "Delete 2" : "Delete 5",
        }),
      );
      expect(onRemove).toHaveBeenCalledExactlyOnceWith(
        scope === "page" ? ["901", "902"] : "all",
      );
    },
  );
});
