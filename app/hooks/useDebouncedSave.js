import { useEffect, useRef, useCallback } from 'react';
import { deepEqual } from '~/lib/utils';

const useDebouncedSave = (update, recentAttempt, submit, nextRecipient, campaign, workspaceId, disposition, toast) => {
    const previousUpdateRef = useRef(update);
    const timeoutRef = useRef(null);
    
    const handleQuestionsSave = useCallback(() => {
        submit({
            update,
            callId: recentAttempt?.id,
            selected_workspace_id: workspaceId,
            contact_id: nextRecipient?.contact?.id,
            queue_id: nextRecipient?.id,
            campaign_id: campaign?.id,
            workspace: workspaceId,
            disposition
        }, {
            method: "PATCH",
            navigate: false,
            action: `/api/questions`,
            encType: 'application/json'
        })
    }, [submit, update, recentAttempt?.id, workspaceId, nextRecipient?.contact?.id, nextRecipient?.id, campaign?.id, disposition]);

    useEffect(() => {
        const shouldUpdate = !deepEqual(update, previousUpdateRef.current);

        if (shouldUpdate) {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            
            timeoutRef.current = setTimeout(() => {
                toast.info("Saving");
                console.log(`Saving updated object: `, { new: update }, { old: previousUpdateRef.current });
                handleQuestionsSave();
                previousUpdateRef.current = update;
                toast.success("Saved");
            }, 1000);
        }

        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [update, handleQuestionsSave, toast]);
};

export default useDebouncedSave;

export const handleQuestionsSave = (update, setUpdate, recentAttempt, submit, nextRecipient, campaign, workspaceId, disposition, toast) => {
    if (update) {
        submit({
            update,
            callId: recentAttempt?.id,
            selected_workspace_id: workspaceId,
            contact_id: nextRecipient?.contact?.id,
            queue_id: nextRecipient.id,
            campaign_id: campaign?.id,
            workspace: workspaceId,
            disposition
        }, {
            method: "PATCH",
            navigate: false,
            action: `/api/questions`,
            encType: 'application/json'
        });
        setUpdate(update);
        toast.success("Saved")
    }
};
