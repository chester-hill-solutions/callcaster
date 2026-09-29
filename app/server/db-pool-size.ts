/**
 * Ceiling on the shared query pool.
 *
 * Lives apart from `@/server/db` so a module that only needs the number does
 * not import the database client to get it — `@/server/db` builds a live pool
 * at import time, and `app/lib` is barred from importing an unscoped client.
 *
 * Exported so anything bounding its own concurrent database work derives from
 * this rather than hard-coding a neighbour. See the campaign SMS preparation
 * gate, which must not queue the pool to capacity.
 */
export const QUERY_POOL_MAX = 10;
