const startConferenceAndDial = async (userId, campaignId, workspaceId) => {
    try {
        let response = await fetch('/api/power-dial', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId })
        });

        let data = await response.json();
        if (data.success) {
            const conferenceName = data.conferenceName;
            console.log('Conference started:', conferenceName);
            response = await fetch('/api/power-dial/dialer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    campaign_id: campaignId,
                    workspaceId
                })
            });

            data = await response.json();
            if (data.success) {
                console.log('Numbers are being dialed and added to the conference');

            } else {
                console.error('Failed to dial numbers:', data.error);
            }
        } else {
            console.error('Failed to start conference:', data.error);
        }
    } catch (error) {
        console.error('Error during conference setup and dialing:', error);
    }
};

export { startConferenceAndDial }
