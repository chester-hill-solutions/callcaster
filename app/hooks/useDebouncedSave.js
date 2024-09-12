import { useFetcher } from '@remix-run/react';
import { useEffect, useRef, useCallback } from 'react';
import { deepEqual } from '~/lib/utils';

const useDebouncedSave = ({
    update,
    recentAttempt,
    nextRecipient,
    campaign,
    workspaceId,
    disposition,
    toast
  }) => {
    const fetcher = useFetcher();
    const previousUpdateRef = useRef(update);
    const previousDispositionRef = useRef(disposition);
    const timeoutRef = useRef(null);
  
    const saveData = useCallback(() => {
      if (nextRecipient?.contact?.id) {
        fetcher.submit(
          {
            update: update,
            callId: recentAttempt?.id,
            selected_workspace_id: workspaceId,
            contact_id: nextRecipient.contact.id,
            queue_id: nextRecipient.id,
            campaign_id: campaign?.id,
            workspace: workspaceId,
            disposition: disposition
          },
          {
            method: "PATCH",
            action: `/api/questions`,
            encType:"application/json"
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
        }
      };
    }, [update, disposition, nextRecipient, saveData, toast]);
  
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