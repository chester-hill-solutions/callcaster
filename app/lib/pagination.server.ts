/**
 * Shared pagination helpers for platform API list endpoints.
 *
 * Extracted from four divergent inline implementations in
 * `platform-data.server.ts` that differed in default page size (20 vs 50),
 * minimum page size (1 vs 10), and response meta shape (`total_pages` vs
 * `has_more` vs `unfiltered_count` + `queued_count`).
 */

export type PaginationOptions = {
  /** Default page size when the query param is missing/invalid. */
  defaultPageSize?: number;
  /** Minimum page size (clamps low values). */
  minPageSize?: number;
  /** Maximum page size (clamps high values). */
  maxPageSize?: number;
  /** Query-param name for the page number. */
  pageParam?: string;
  /** Query-param name for the page size. */
  pageSizeParam?: string;
};

export type PaginationState = {
  page: number;
  pageSize: number;
  offset: number;
};

export type PaginationMeta = {
  page: number;
  page_size: number;
  total_count?: number;
  total_pages?: number;
  has_more?: boolean;
  unfiltered_count?: number;
  queued_count?: number;
};

export type PaginatedEnvelope<T> = {
  data: T;
  pagination: PaginationMeta;
};

/**
 * Parse `page` and `page_size` from a `URLSearchParams` (or `Request`).
 *
 * Defaults: `page = 1`, `page_size = 20`, clamped to `[1, 100]`. All
 * configurable via `options`. Returns `{ page, pageSize, offset }` where
 * `offset = (page - 1) * pageSize`.
 */
export function parsePagination(
  searchParams: URLSearchParams,
  options: PaginationOptions = {},
): PaginationState {
  const {
    defaultPageSize = 20,
    minPageSize = 1,
    maxPageSize = 100,
    pageParam = "page",
    pageSizeParam = "page_size",
  } = options;

  const page = Math.max(
    1,
    Number.parseInt(searchParams.get(pageParam) || "1", 10) || 1,
  );
  const pageSize = Math.min(
    maxPageSize,
    Math.max(
      minPageSize,
      Number.parseInt(
        searchParams.get(pageSizeParam) || String(defaultPageSize),
        10,
      ) || defaultPageSize,
    ),
  );
  const offset = (page - 1) * pageSize;

  return { page, pageSize, offset };
}

/**
 * Wrap paginated data with a standard `{ data, pagination }` envelope.
 *
 * Use this for new endpoints that don't need a custom response shape. Existing
 * endpoints with bespoke shapes (e.g. `{ contacts, pagination, search_query }`)
 * can build the `pagination` object directly using the `PaginationMeta` type.
 */
export function paginatedEnvelope<T>(
  data: T,
  meta: PaginationMeta,
): PaginatedEnvelope<T> {
  return { data, pagination: meta };
}
