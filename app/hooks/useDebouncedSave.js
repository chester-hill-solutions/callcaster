import { useEffect, useRef } from 'react';
import { deepEqual } from '~/lib/utils';

export const handleQuestionsSave = (update, setUpdate, recentAttempt, submit, nextRecipient, campaign, workspaceId) => {
    submit({
        update,
        callId: recentAttempt?.id,
        selected_workspace_id: workspaceId,
        contact_id: nextRecipient.contact.id,
        campaign_id: campaign.id,
        workspace: workspaceId
    }, {
        method: "PATCH",
        navigate: false,
        action: `/api/questions`,
        encType: 'application/json'
    });
    setUpdate(update);
};

const useDebouncedSave = (update, recentAttempt, submit, nextRecipient, campaign, workspaceId) => {
    const handlerRef = useRef(null);

    useEffect(() => {
        const handleQuestionsSave = () => {
            submit({
                update,
                callId: recentAttempt?.id,
                selected_workspace_id: workspaceId,
                contact_id: nextRecipient.contact.id,
                campaign_id: campaign.id,
                workspace: workspaceId
            }, {
                method: "PATCH",
                navigate: false,
                action: `/api/questions`,
                encType: 'application/json'
            });
        };

        handlerRef.current = setTimeout(() => {
            const att = recentAttempt ? {...recentAttempt.result} : {}
            const upd = {...update}
            if (!deepEqual(att, upd)) {
                console.log(`Saving updated object: `, { new: att}, { old:upd });

                handleQuestionsSave();
            }
        }, 1000);

        return () => {
            clearTimeout(handlerRef.current);
        };
    }, [update, recentAttempt, submit, nextRecipient, campaign, workspaceId]);
};

export default useDebouncedSave;
