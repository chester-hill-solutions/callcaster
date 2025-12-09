import { useFetcher } from '@remix-run/react';
import { useEffect, useRef, useCallback } from 'react';
import { deepEqual } from '~/lib/utils';
import type { QueueItem, OutreachAttempt, Campaign } from '~/lib/types';

type ToastType = {
    success: (message: string | React.ReactNode, data?: unknown) => string | number;
    error: (message: string | React.ReactNode, data?: unknown) => string | number;
    warning: (message: string | React.ReactNode, data?: unknown) => string | number;
};

interface UseDebouncedSaveParams {
    update: Record<string, unknown> | null;
    recentAttempt: OutreachAttempt | null;
    nextRecipient: QueueItem | null;
    campaign: Campaign | null;
    workspaceId: string;
    disposition: string | null;
    toast: ToastType;
}

interface UseDebouncedSaveReturn {
    saveData: () => void;
    isSaving: boolean;
}

interface FetcherData {
    id?: number;
    error?: string;
}

/**
 * Hook for debounced saving of outreach attempt data
 * 
 * Automatically saves outreach attempt updates and disposition changes after a 2-second
 * debounce period. Only saves when data actually changes and when a valid recipient is available.
 * Provides toast notifications for success/failure and exposes loading state.
 * 
 * @param params - Configuration object
 * @param params.update - Update data object containing question responses
 * @param params.recentAttempt - Recent outreach attempt to associate with update
 * @param params.nextRecipient - Next recipient in queue (must have contact.id)
 * @param params.campaign - Current campaign
 * @param params.workspaceId - Workspace ID
 * @param params.disposition - Call disposition/outcome
 * @param params.toast - Toast notification functions (success, error, warning)
 * 
 * @returns Object containing:
 *   - saveData: Function to manually trigger save (bypasses debounce)
 *   - isSaving: Boolean indicating if save operation is in progress
 * 
 * @example
 * ```tsx
 * const {
 *   saveData,
 *   isSaving
 * } = useDebouncedSave({
 *   update: { question1: 'answer1', question2: 'answer2' },
 *   recentAttempt: currentAttempt,
 *   nextRecipient: queueItem,
 *   campaign: currentCampaign,
 *   workspaceId: workspace.id,
 *   disposition: 'answered',
 *   toast
 * });
 * 
 * // Automatic save after 2 seconds of no changes
 * // Or manually trigger save
 * saveData();
 * 
 * // Show loading indicator
 * {isSaving && <div>Saving...</div>}
 * ```
 */
const useDebouncedSave = ({
    update,
    recentAttempt,
    nextRecipient,
    campaign,
    workspaceId,
    disposition,
    toast
}: UseDebouncedSaveParams): UseDebouncedSaveReturn => {
    const fetcher = useFetcher<FetcherData>();
    const previousUpdateRef = useRef<Record<string, unknown> | null>(update);
    const previousDispositionRef = useRef<string | null>(disposition);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
    const saveData = useCallback(() => {
        if (nextRecipient?.contact?.id) {
            fetcher.submit(
                {
                    update: update,
                    callId: recentAttempt?.id?.toString(),
                    selected_workspace_id: workspaceId,
                    contact_id: nextRecipient.contact.id.toString(),
                    queue_id: nextRecipient.id.toString(),
                    campaign_id: campaign?.id?.toString(),
                    workspace: workspaceId,
                    disposition: disposition || ''
                },
                {
                    method: "PATCH",
                    action: `/api/questions`,
                    encType: "application/json"
                }
            );
        } else {
            console.warn("Cannot save: nextRecipient.contact.id is missing");
            toast.warning("Cannot save at this time. Some data is missing.");
        }
    }, [fetcher, update, recentAttempt?.id, workspaceId, nextRecipient, campaign?.id, disposition, toast]);
  
    useEffect(() => {
        const shouldUpdate = nextRecipient && 
            (!deepEqual(update, previousUpdateRef.current) || 
             !deepEqual(disposition, previousDispositionRef.current));
    
        if (shouldUpdate) {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
    
            timeoutRef.current = setTimeout(() => {
                saveData();
                previousUpdateRef.current = update;
                previousDispositionRef.current = disposition;
            }, 2000);
        }
    
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        };
    }, [update, disposition, nextRecipient, saveData]);
  
    useEffect(() => {
        if (fetcher.state === 'idle' && fetcher.data) {
            if (fetcher.data.id) {
                toast.success("Saved successfully");
            } else {
                console.error("Save failed:", fetcher.data.error);
                toast.error(`Save failed: ${fetcher.data.error || 'Unknown error'}`);
            }
        }
    }, [fetcher.state, fetcher.data, toast]);
  
    return { saveData, isSaving: fetcher.state === 'submitting' };
};

export default useDebouncedSave;

