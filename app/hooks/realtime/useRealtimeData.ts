import { useState } from "react";

type ContactState = {
    isSyncing: boolean;
    error: Error | null;
};

/**
 * Compatibility stub retained for light test/import compatibility.
 *
 * @deprecated This hook does not subscribe to realtime updates. Production consumers
 * should read loader data directly and use `useWorkspaceEventSubscription` to
 * revalidate loaders for supported SSE events.
 */
export function useRealtimeData<T extends { id: number | string }>(
  _client: unknown,
  workspace_id: string,
  table: string,
  initialData: (T | null)[] | null = null,
) {
  const [data] = useState<Record<string, T[]>>(() => ({
    [table]: initialData?.filter((item): item is T => Boolean(item)) || [],
  }));

  const [state] = useState<ContactState>({
    isSyncing: false,
    error: null,
  });

  void workspace_id;
  void table;

  return { data: data[table], ...state };
}

