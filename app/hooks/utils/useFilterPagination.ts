import { useState } from "react";

export function useFilterPagination(
  filterKey: string,
  initialPage = 1,
  totalPages = Number.POSITIVE_INFINITY,
) {
  const [pageState, setPageState] = useState({ filterKey, page: initialPage });
  const lastPage = Math.max(1, totalPages);
  const clampPage = (page: number) => Math.max(1, Math.min(page, lastPage));
  const currentPage = clampPage(
    pageState.filterKey === filterKey ? pageState.page : initialPage,
  );
  if (pageState.filterKey === filterKey && pageState.page !== currentPage) {
    setPageState({ filterKey, page: currentPage });
  }

  const setCurrentPage = (
    page: number | ((previousPage: number) => number),
  ) => {
    setPageState((previous) => {
      const resolvedCurrentPage = clampPage(
        previous.filterKey === filterKey ? previous.page : initialPage,
      );
      const nextPage =
        typeof page === "function" ? page(resolvedCurrentPage) : page;
      return { filterKey, page: clampPage(nextPage) };
    });
  };

  return { currentPage, setCurrentPage };
}
