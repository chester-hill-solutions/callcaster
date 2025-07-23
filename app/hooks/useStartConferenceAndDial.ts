import { useState, useCallback } from "react";
import { BaseUser } from "~/lib/types";

const useStartConferenceAndDial = ({ userId, campaignId, workspaceId, callerId, selectedDevice }: { userId: string, campaignId: string, workspaceId: string, callerId: string, selectedDevice: string }) => {
    const [conference, setConference] = useState(null);
    const [creditsError, setCreditsError] = useState(false);
    
    const begin = useCallback(async () => {
        try {
            const startConferenceResponse = await fetch('/api/auto-dial', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    caller_id: callerId,
                    workspace_id: workspaceId,
                    campaign_id: campaignId,
                    selected_device: selectedDevice
                })
            });

            const startConferenceData = await startConferenceResponse.json();
            if (startConferenceData.creditsError) {
                setCreditsError(true);
                return;
            }
             if (startConferenceData.success) {
                const conferenceName = startConferenceData.conferenceName;
                setConference(conferenceName);
            } else {
                console.error('Failed to start conference:', startConferenceData.error);
            }
        } catch (error) {
            console.error('Error during conference setup and dialing:', error);
        }
    }, [userId, campaignId, workspaceId, callerId, selectedDevice]);

    return { begin, conference, setConference, creditsError };
};

export { useStartConferenceAndDial };
