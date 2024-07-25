import { useEffect, useRef, useCallback } from 'react';
import { deepEqual } from '~/lib/utils';

const useDebouncedSave = (update, recentAttempt, submit, nextRecipient, campaign, workspaceId, disposition) => {
    const previousUpdateRef = useRef(update);
    const timeoutRef = useRef(null);

    const handleQuestionsSave = useCallback(() => {
        submit({
            update,
            callId: recentAttempt?.id,
            selected_workspace_id: workspaceId,
            contact_id: nextRecipient?.contact?.id,
            campaign_id: campaign?.id,
            workspace: workspaceId,
            disposition
        }, {
            method: "PATCH",
            navigate: false,
            action: `/api/questions`,
            encType: 'application/json'
        });
    }, [submit, update, recentAttempt?.id, workspaceId, nextRecipient?.contact?.id, campaign?.id, disposition]);

    useEffect(() => {
        const shouldUpdate = !deepEqual(update, previousUpdateRef.current);
        
        if (shouldUpdate) {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }

            timeoutRef.current = setTimeout(() => {
                console.log(`Saving updated object: `, { new: update }, { old: previousUpdateRef.current });
                handleQuestionsSave();
                previousUpdateRef.current = update;
            }, 1000);
        }

        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [update, handleQuestionsSave]);
};

export default useDebouncedSave;
export const handleQuestionsSave = (update, setUpdate, recentAttempt, submit, nextRecipient, campaign, workspaceId, disposition) => {
    submit({
        update,
        callId: recentAttempt?.id,
        selected_workspace_id: workspaceId,
        contact_id: nextRecipient?.contact?.id,
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
};
