import { useFetcher } from 'react-router';
import { useEffect, useRef, useCallback } from 'react';
import { deepEqual } from '@/lib/utils';
import type { QueueItem, OutreachAttempt, Campaign } from '@/lib/types';
import { logger } from "@/lib/logger.client";

type ToastType = {
    success: (message: string | React.ReactNode, data?: unknown) => string | number;
    error: (message: string | React.ReactNode, data?: unknown) => string | number;
    warning: (message: string | React.ReactNode, data?: unknown) => string | number;
};

interface UseDebouncedSaveParams {
    update: Record<string, unknown> | null;
    recentAttempt: OutreachAttempt | null;
    /**
     * The contact this save applies to. Pass the call screen's
     * `questionContact` (who the script/disposition panel is currently
     * recording an outcome for) here — NOT the queue's `nextRecipient`
     * pointer. Hanging up dequeues the just-finished contact immediately, so
     * `nextRecipient` can go null (or jump to a different contact) before
     * the agent saves; using it here silently dropped the save (#1253).
     */
    questionContact: QueueItem | null;
    campaign: Campaign | null;
    workspaceId: string;
    disposition: string | null;
    toast: ToastType;
    /** Suppress the "Saved successfully" success toast (errors still toast). */
    silent?: boolean;
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
 * @param params.questionContact - Contact the panel is recording for (must have contact.id);
 *   the call screen's questionContact, not the queue's nextRecipient pointer
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
 *   questionContact: queueItem,
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
    questionContact,
    campaign,
    workspaceId,
    disposition,
    toast,
    silent = false
}: UseDebouncedSaveParams): UseDebouncedSaveReturn => {
    const fetcher = useFetcher<FetcherData>();
    const previousUpdateRef = useRef<Record<string, unknown> | null>(update);
    const previousDispositionRef = useRef<string | null>(disposition);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
    // A save is meaningful when the agent has answered something or chosen a
    // real outcome. "idle" is the between-calls sentinel derived from a null
    // recentAttempt — submitting it after "Save and Next" wrote phantom
    // attempts against the NEXT contact with empty answers.
    const hasAnswers = update != null && Object.keys(update).length > 0;
    const hasRealDisposition = Boolean(disposition && disposition !== "idle");
    const isMeaningful = hasAnswers || hasRealDisposition;

    const saveData = useCallback(() => {
        if (!(update != null && Object.keys(update).length > 0) &&
            !(disposition && disposition !== "idle")) {
            return;
        }
        if (questionContact?.contact?.id) {
            // JSON on purpose: the route parses JSON natively, and FormData's
            // urlencoded serialization was 400ing at the JSON-only parser.
            const payload: Record<string, unknown> = {
                update: update ?? {},
                callId: recentAttempt?.id ?? null,
                contact_id: Number(questionContact.contact.id),
                campaign_id: campaign?.id != null ? Number(campaign.id) : null,
                queue_id: Number(questionContact.id),
                workspace: workspaceId,
                disposition: disposition || "",
            };
            fetcher.submit(
                payload as Parameters<typeof fetcher.submit>[0],
                {
                    method: "PATCH",
                    action: `/api/questions`,
                    encType: "application/json",
                }
            );
        } else {
            logger.warn("Cannot save: questionContact.contact.id is missing");
            toast.warning("Cannot save at this time. Some data is missing.");
        }
    }, [fetcher, update, recentAttempt?.id, workspaceId, questionContact, campaign?.id, disposition, toast]);
  
    /**
     * @effect Debounce saveData() by 2s after `update`/`disposition` change, skipping no-op edits.
     * @effect-deps update, disposition, questionContact (only schedules a save when a contact is
     *   under review and the value actually changed vs. the previous* refs), saveData
     * @effect-side-effects timer (setTimeout; cleared on re-schedule/unmount) — saveData() itself
     *   submits via fetcher.submit (fetch), but that call happens inside the timer callback, not here
     * @effect-why-not-loader Debounced auto-save on local edits needs a client timer; it's a mutation
     *   (fetcher.submit) triggered by user input, not something a loader can express.
     */
    useEffect(() => {
        const shouldUpdate = questionContact && isMeaningful &&
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
    }, [update, disposition, questionContact, saveData, isMeaningful]);
  
    /**
     * @effect CANDIDATE-REMOVE Toast success/failure once the save fetcher settles.
     * @effect-deps fetcher.state, fetcher.data, toast (watches for idle+data to report the result)
     * @effect-side-effects none directly — reads fetcher state; calls toast.success/error
     * @effect-why-not-loader This is the exact pattern app/hooks/utils/useFetcherOnIdle.ts was built
     *   to replace: watching raw fetcher.state/fetcher.data can re-fire on stale/identical data across
     *   renders, whereas useFetcherOnIdle fires exactly once per busy->idle transition. Could migrate
     *   to `useFetcherOnIdle(fetcher, (data) => { ... })` instead of this hand-rolled watcher.
     */
    useEffect(() => {
        if (fetcher.state === 'idle' && fetcher.data) {
            if (fetcher.data.id) {
                if (!silent) toast.success("Saved successfully");
            } else {
                logger.error("Save failed:", fetcher.data.error);
                toast.error(`Save failed: ${fetcher.data.error || 'Unknown error'}`);
            }
        }
    }, [fetcher.state, fetcher.data, toast, silent]);
  
    return { saveData, isSaving: fetcher.state === 'submitting' };
};

export default useDebouncedSave;

