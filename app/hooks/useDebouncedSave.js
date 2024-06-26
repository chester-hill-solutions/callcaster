import { useEffect, useRef } from 'react';

export const handleQuestionsSave = (update, recentAttempt, submit, nextRecipient, campaign, workspaceId) => {
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
            const att = {...recentAttempt.result}
            const upd = {...update}
            if (JSON.stringify(att) !== JSON.stringify(upd)) {
                console.log(`Saving updated object: `, { new: { ...update } }, { old: { ...recentAttempt.result } });
                handleQuestionsSave();
            }
        }, 1000);

        return () => {
            clearTimeout(handlerRef.current);
        };
    }, [update, recentAttempt, submit, nextRecipient, campaign, workspaceId]);
};

export default useDebouncedSave;
