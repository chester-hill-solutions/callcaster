import { useCallback } from "react";
import { useSearchParams } from "react-router";

export function useSearchParamsPagination() {
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get("page") ?? "1") || 1;
  const pageSize = Number(searchParams.get("pageSize") ?? "25") || 25;

  const setPage = useCallback(
    (newPage: number) => {
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous);
        next.set("page", String(newPage));
        return next;
      });
    },
    [setSearchParams],
  );

  const setPageSize = useCallback(
    (newSize: number | string) => {
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous);
        next.set("page", "1");
        next.set("pageSize", String(newSize));
        return next;
      });
    },
    [setSearchParams],
  );

  const setParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous);
        if (value == null || value === "") {
          next.delete(key);
        } else {
          next.set(key, value);
        }
        next.delete("page");
        return next;
      });
    },
    [setSearchParams],
  );

  return {
    searchParams,
    setSearchParams,
    page,
    pageSize,
    setPage,
    setPageSize,
    setParam,
  };
}
