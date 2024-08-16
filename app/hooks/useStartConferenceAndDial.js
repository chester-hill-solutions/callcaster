import { useState, useCallback } from "react";

const useStartConferenceAndDial = (userId, campaignId, workspaceId, callerId, initialConference) => {
    const [conference, setConference] = useState(initialConference);
    conference
    const begin = useCallback(async () => {
        try {
            const startConferenceResponse = await fetch('/api/auto-dial', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, caller_id: callerId, workspace_id: workspaceId, campaign_id: campaignId })
            });

            const startConferenceData = await startConferenceResponse.json();
            if (startConferenceData.success) {
                const conferenceName = startConferenceData.conferenceName;
                setConference(conferenceName);
                console.log('Conference started:', conferenceName);

                const dialResponse = await fetch('/api/auto-dial/dialer', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: userId,
                        campaign_id: campaignId,
                        workspace_id: workspaceId
                    })
                });

                const dialData = await dialResponse.json();
                if (dialData.success) {
                    console.log('Numbers are being dialed and added to the conference');
                } else {
                    console.error('Failed to dial numbers:', dialData.error);
                }
            } else {
                console.error('Failed to start conference:', startConferenceData.error);
            }
        } catch (error) {
            console.error('Error during conference setup and dialing:', error);
        }
    }, [userId, campaignId, workspaceId, callerId]);

    return { begin, conference, setConference };
};

export { useStartConferenceAndDial };
