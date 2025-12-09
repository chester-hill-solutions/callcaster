import { useState, useCallback } from "react";
import { WorkspaceNumbers } from "~/lib/types";

/**
 * Hook for managing workspace phone numbers state
 * 
 * Provides state management for workspace phone numbers with realtime update support.
 * Handles INSERT, UPDATE, and DELETE events from Supabase realtime subscriptions,
 * automatically filtering updates to only include numbers for the specified workspace.
 * 
 * @param initialPhoneNumbers - Initial list of phone numbers for the workspace
 * @param workspace - Workspace ID to filter phone numbers
 * 
 * @returns Object containing:
 *   - phoneNumbers: Current list of phone numbers
 *   - setPhoneNumbers: Direct setter for phone numbers (use with caution)
 *   - updateWorkspaceNumbers: Function to update phone numbers from realtime payload
 * 
 * @example
 * ```tsx
 * const { phoneNumbers, updateWorkspaceNumbers } = usePhoneNumbers(
 *   initialNumbers,
 *   workspaceId
 * );
 * 
 * // Use in realtime subscription handler
 * useSupabaseRealtimeSubscription({
 *   supabase,
 *   table: 'workspace_number',
 *   onChange: (payload) => {
 *     updateWorkspaceNumbers({
 *       eventType: payload.eventType,
 *       old: payload.old,
 *       new: payload.new,
 *     });
 *   },
 * });
 * ```
 */
export const usePhoneNumbers = (initialPhoneNumbers: WorkspaceNumbers[], workspace: string) => {
  const [phoneNumbers, setPhoneNumbers] = useState<WorkspaceNumbers[]>(initialPhoneNumbers);

  const updateWorkspaceNumbers = useCallback((payload: { eventType: string; old: WorkspaceNumbers | null; new: WorkspaceNumbers | null }) => {
    // Validate payload
    if (!payload || !payload.eventType) {
      console.error('Invalid phone number update payload: payload or eventType is missing');
      return;
    }

    setPhoneNumbers((currentNumbers) => {
      try {
        switch (payload.eventType) {
          case "INSERT":
            if (!payload.new) {
              console.error('INSERT event missing new data');
              return currentNumbers;
            }
            if (payload.new.workspace === workspace) {
              if (!payload.new.id) {
                console.error('INSERT event missing id');
                return currentNumbers;
              }
              return [...currentNumbers, payload.new];
            }
            break;
          case "UPDATE":
            if (!payload.new) {
              console.error('UPDATE event missing new data');
              return currentNumbers;
            }
            if (payload.new.workspace === workspace) {
              if (!payload.new.id) {
                console.error('UPDATE event missing id');
                return currentNumbers;
              }
              return currentNumbers.map((item) => 
                item.id === payload.new?.id ? payload.new : item
              );
            }
            break;
          case "DELETE":
            if (!payload.old) {
              console.error('DELETE event missing old data');
              return currentNumbers;
            }
            if (!payload.old.id) {
              console.error('DELETE event missing id');
              return currentNumbers;
            }
            return currentNumbers.filter((item) => item.id !== payload.old?.id);
          default:
            console.warn(`Unknown event type: ${payload.eventType}`);
            return currentNumbers;
        }
        return currentNumbers;
      } catch (error) {
        console.error('Error updating phone numbers:', error);
        return currentNumbers;
      }
    });
  }, [workspace]);

  return { phoneNumbers, setPhoneNumbers, updateWorkspaceNumbers };
};