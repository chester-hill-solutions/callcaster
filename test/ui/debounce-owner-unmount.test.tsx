import React from "react";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useDebounce } from "@/hooks/utils/useDebounce";
import { ConversationSidebar } from "../../app/routes/workspaces+/$id/chats/ConversationSidebar";

vi.mock("@/hooks", () => ({ useInfiniteScroll: () => [() => {}] }));
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

function sidebar() {
  const filters: string[] = [];
  const view = render(<MemoryRouter><ConversationSidebar
    campaigns={[]} chats={[]} chatsError={null} formatDate={value => value}
    handleExistingConversationClick={() => {}} onLoadMore={() => {}}
    paginationState={{ hasMore: false, page: 1, pageSize: 20 }}
    paginationFetcherState="idle" searchParams={new URLSearchParams()} sortBy="recent"
    hideStopConversations={false} onHideStopChange={() => {}}
    updateFilters={update => { filters.push(update(new URLSearchParams()).get("search") ?? ""); }}
  /></MemoryRouter>);
  return { ...view, filters };
}

describe("debounce owner lifetime (#2108)", () => {
  test("a pending callback is canceled on true hook unmount", () => {
    const called = vi.fn();
    const { result, unmount } = renderHook(() => useDebounce(called, 300));
    act(() => { result.current("unsent"); });
    unmount();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(called).not.toHaveBeenCalled();
  });

  test("rerender does not cancel the pending callback, and only the last value fires", () => {
    const values: string[] = [];
    const { result, rerender } = renderHook(() => useDebounce((value: string) => { values.push(value); }, 300));
    act(() => { result.current("earlier"); result.current("last"); });
    rerender();
    act(() => { vi.advanceTimersByTime(299); });
    expect(values).toEqual([]);
    act(() => { vi.advanceTimersByTime(1); });
    expect(values).toEqual(["last"]);
  });

  test("the actual conversation sidebar sends the latest trimmed search after 300ms", () => {
    const { filters } = sidebar();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search conversations" }), { target: { value: "Old" } });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search conversations" }), { target: { value: "  Latest  " } });
    act(() => { vi.advanceTimersByTime(299); });
    expect(filters).toEqual([]);
    act(() => { vi.advanceTimersByTime(1); });
    expect(filters).toEqual(["Latest"]);
  });

  test("the actual conversation sidebar cannot update filters after unmount", () => {
    const { filters, unmount } = sidebar();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search conversations" }), { target: { value: "Unsent" } });
    unmount();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(filters).toEqual([]);
  });
});
