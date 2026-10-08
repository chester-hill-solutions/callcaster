import { render, screen } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import TablePagination from "../../app/components/shared/TablePagination";

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
  test("changing size resets a stateful consumer to its first records", async () => {
    function Fixture() {
      const [page, setPage] = useState(2);
      const [size, setSize] = useState(10);
      const records = Array.from({ length: 12 }, (_, index) => index + 1);
      return (
        <>
          <ul aria-label="Records">
            {records.slice((page - 1) * size, page * size).map((record) => (
              <li key={record}>Record {record}</li>
            ))}
          </ul>
          <TablePagination
            currentPage={page}
            totalPages={Math.ceil(records.length / size)}
            pageSize={size}
            totalCount={records.length}
            showSummary
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageSizeChange={setSize}
            onPageChange={setPage}
          />
        </>
      );
    }
    render(<Fixture />);
    const user = userEvent.setup();
    expect(
      screen.queryByText("Record 1", { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen
        .getAllByRole("listitem")
        .filter((item) => item.textContent?.startsWith("Record ")),
    ).toHaveLength(2);
    await user.click(screen.getByRole("combobox", { name: "Rows per page" }));
    await user.click(
      await screen.findByRole("option", { name: "50 per page" }),
    );
    expect(screen.getByText("Record 1", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Record 12", { exact: true })).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("listitem")
        .filter((item) => item.textContent?.startsWith("Record ")),
    ).toHaveLength(12);
    expect(
      screen.getByText("Showing 1 to 12 of 12 results"),
    ).toBeInTheDocument();
  });

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
    await user.click(
      await screen.findByRole("option", { name: "20 per page" }),
    );

    expect(onPageSizeChange).toHaveBeenCalledWith(20);
  });

  test("page controls call onPageChange with the adjacent page", async () => {
    const { onPageChange } = renderPagination();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Go to next page" }));
    expect(onPageChange).toHaveBeenCalledWith(3);

    await user.click(
      screen.getByRole("button", { name: "Go to previous page" }),
    );
    expect(onPageChange).toHaveBeenCalledWith(1);
  });
});
