import { useEffect } from "react";
import { useFetcher } from "react-router";

export type ApiKeyRecord = {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  scopes?: string[] | null;
  expires_at?: string | null;
};

/**
 * Owns the workspace API keys list: loads it from the API keys resource
 * route when the route loader didn't provide keys, and exposes `refresh`
 * for re-fetching after mutations.
 */
export function useApiKeys({
  workspaceId,
  hasAccess,
  initialKeys = [],
}: {
  workspaceId: string;
  hasAccess: boolean;
  initialKeys?: ApiKeyRecord[];
}) {
  const listFetcher = useFetcher<{ keys?: ApiKeyRecord[]; error?: string }>({
    key: "api-keys-list",
  });

  const refresh = () => {
    listFetcher.load(
      `/api/workspace-api-keys?workspace_id=${encodeURIComponent(workspaceId)}`,
    );
  };

  /**
   * @effect CANDIDATE-REMOVE Fetches from the API keys resource route (external system) on mount
   *   when no keys came from the route loader.
   * @effect-deps workspaceId, hasAccess, initialKeys.length. `listFetcher` is intentionally omitted
   *   (see eslint-disable below): `useFetcher()`'s returned object is memoized on the fetcher's own
   *   state/data, so its identity changes every time `.load()` resolves; including it here would
   *   re-run this effect right after the fetch completes and re-trigger `.load()` in an infinite loop,
   *   since the guard condition (`initialKeys.length === 0`) doesn't change once the request settles.
   * @effect-side-effects fetch (listFetcher.load against /api/workspace-api-keys)
   * @effect-why-not-loader Fallback fetch for data the route loader is expected to provide — if the
   *   loader can supply `initialKeys` unconditionally (or via a deferred/`<Await>` promise) whenever
   *   `hasAccess` is known server-side, this client-side mount fetch could be removed entirely.
   */
  useEffect(() => {
    if (workspaceId && hasAccess && initialKeys.length === 0) {
      listFetcher.load(
        `/api/workspace-api-keys?workspace_id=${encodeURIComponent(workspaceId)}`,
      );
    }
    // listFetcher's identity changes on every state transition (idle->loading->idle);
    // depending on it would refire this effect after each .load() resolves and
    // re-trigger the fetch in a loop. See @effect-deps above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, hasAccess, initialKeys.length]);

  const keys: ApiKeyRecord[] = listFetcher.data?.keys ?? initialKeys;
  const isLoading =
    listFetcher.state === "loading" ||
    (listFetcher.state === "idle" &&
      listFetcher.data === undefined &&
      initialKeys.length === 0);

  return { keys, isLoading, error: listFetcher.data?.error, refresh };
}
