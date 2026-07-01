import { useEffect, useState, useRef, useMemo } from 'react';
import { logger } from "@/lib/logger.client";

type ContactState = {
    isSyncing: boolean;
    error: Error | null;
};

const WORKSPACE_ID_TABLES = new Set(["workspace_users"]);

const getWorkspaceColumn = (table: string) => {
    if (table === "workspace") return "id";
    if (WORKSPACE_ID_TABLES.has(table)) return "workspace_id";
    return "workspace";
};

interface RealtimePayload {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    new: Record<string, unknown>;
    old: Record<string, unknown>;
}

/**
 * Hook for real-time data synchronization with Postgres
 * 
 * Subscribes to Postgres realtime changes for a specific table and workspace, automatically
 * updating local state when INSERT, UPDATE, or DELETE events occur. Handles initial data
 * fetching if not provided and manages subscription lifecycle.
 * 
 * @template T - Type of data items (must have an `id` property)
 * @param client - Postgres client instance
 * @param workspace_id - Workspace ID for filtering data
 * @param table - Table name to subscribe to
 * @param initialData - Optional initial data array (if provided, skips initial fetch)
 * 
 * @returns Object containing:
 *   - data: Array of data items from the table
 *   - isSyncing: Boolean indicating if initial sync or subscription setup is in progress
 *   - error: Error object if an error occurred, null otherwise
 * 
 * @example
 * ```tsx
 * interface Contact {
 *   id: number;
 *   name: string;
 *   phone: string;
 * }
 * 
 * const {
 *   data: contacts,
 *   isSyncing,
 *   error
 * } = useRealtimeData<Contact>(
 *   client,
 *   workspace.id,
 *   'contact',
 *   initialContacts // optional
 * );
 * 
 * if (isSyncing) {
 *   return <div>Loading...</div>;
 * }
 * 
 * if (error) {
 *   return <div>Error: {error.message}</div>;
 * }
 * 
 * return (
 *   <div>
 *     {contacts.map(contact => (
 *       <div key={contact.id}>{contact.name}</div>
 *     ))}
 *   </div>
 * );
 * ```
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

  // Stub: realtime subscription removed during Supabase -> Drizzle migration.
  // Consumers should migrate to useWorkspaceEventSubscription for SSE-based updates.
  void workspace_id;
  void table;

  return { data: data[table], ...state };
}

