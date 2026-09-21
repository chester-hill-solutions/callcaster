import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import TablePagination from "../../app/components/shared/TablePagination";

// The admin panels' hand-rolled pagination consolidated onto the canonical
// TablePagination; the page-size select is the piece the admin panels
// needed. These tests pin the summary rendering and the new select wiring.

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

function renderPagination() {
  const onPageChange = vi.fn();
  const onPageSizeChange = vi.fn();
  render(
    <TablePagination
      currentPage={2}
      totalPages={5}
      pageSize={10}
      totalCount={25}
      showSummary
      pageSizeOptions={PAGE_SIZE_OPTIONS}
      onPageSizeChange={onPageSizeChange}
      onPageChange={onPageChange}
    />,
  );
  return { onPageChange, onPageSizeChange };
}

describe("TablePagination with a page-size select", () => {
  test("renders the range summary and the page-size select", () => {
    renderPagination();

    expect(
      screen.getByText(/showing 11 to 20 of 25 results/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Rows per page" }),
    ).toBeInTheDocument();
  });

  test("choosing a page size calls onPageSizeChange", async () => {
    const { onPageSizeChange } = renderPagination();
    const user = userEvent.setup();

    await user.click(screen.getByRole("combobox", { name: "Rows per page" }));
    await user.click(await screen.findByRole("option", { name: "20 per page" }));

    expect(onPageSizeChange).toHaveBeenCalledWith(20);
  });

  test("page controls call onPageChange with the adjacent page", async () => {
    const { onPageChange } = renderPagination();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Go to next page" }));
    expect(onPageChange).toHaveBeenCalledWith(3);

    await user.click(screen.getByRole("button", { name: "Go to previous page" }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });
});