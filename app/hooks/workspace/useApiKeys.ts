import { useEffect } from "react";
import { useFetcher } from "react-router";

export type ApiKeyRecord = {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
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

  // Fetches from the API keys resource route (external system) on mount
  // when no keys came from the route loader.
  useEffect(() => {
    if (workspaceId && hasAccess && initialKeys.length === 0) {
      listFetcher.load(
        `/api/workspace-api-keys?workspace_id=${encodeURIComponent(workspaceId)}`,
      );
    }
  }, [workspaceId, hasAccess, initialKeys.length]);

  const keys: ApiKeyRecord[] = listFetcher.data?.keys ?? initialKeys;
  const isLoading =
    listFetcher.state === "loading" ||
    (listFetcher.state === "idle" &&
      listFetcher.data === undefined &&
      initialKeys.length === 0);

  return { keys, isLoading, error: listFetcher.data?.error, refresh };
}
