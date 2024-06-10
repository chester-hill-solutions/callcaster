import { useEffect, useRef } from 'react';

const useDebouncedSave = (update, recentAttempt, submit, nextRecipient, campaign, workspaceId) => {
    const handlerRef = useRef(null);

    useEffect(() => {
        const handleQuestionsSave = () => {
            submit({
                update,
                callId: recentAttempt?.id,
                selected_workspace_id: workspaceId,
                contact_id: nextRecipient.contact.id,
                campaign_id: campaign.id
            }, {
                method: "PATCH",
                navigate: false,
                action: `/api/questions`,
                encType: 'application/json'
            });
        };

        handlerRef.current = setTimeout(() => {
            if (JSON.stringify(update) !== JSON.stringify({ ...recentAttempt?.result })) {
                console.log(`Saving updated object: `, { new: { ...update } }, { old: { ...recentAttempt.result } });
                handleQuestionsSave();
            }
        }, 3000);

        return () => {
            clearTimeout(handlerRef.current);
        };
    }, [update, recentAttempt, submit, nextRecipient, campaign, workspaceId]);
};

export default useDebouncedSave;
