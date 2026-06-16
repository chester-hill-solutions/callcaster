import { useState } from "react";

export function useFilterPagination(filterKey: string, initialPage = 1) {
  const [pageState, setPageState] = useState({ filterKey, page: initialPage });
  const currentPage =
    pageState.filterKey === filterKey ? pageState.page : initialPage;

  const setCurrentPage = (page: number | ((previousPage: number) => number)) => {
    setPageState((previous) => {
      const resolvedCurrentPage =
        previous.filterKey === filterKey ? previous.page : initialPage;
      const nextPage =
        typeof page === "function" ? page(resolvedCurrentPage) : page;
      return { filterKey, page: nextPage };
    });
  };

  return { currentPage, setCurrentPage };
}
