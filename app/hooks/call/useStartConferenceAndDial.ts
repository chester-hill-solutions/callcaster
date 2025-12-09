import { useState, useCallback } from "react";
import { BaseUser } from "@/lib/types";
import { startConferenceAndDial } from "@/lib/services/hooks-api";

/**
 * Hook for starting a Twilio conference and initiating a dial
 * 
 * Manages the conference creation and dialing process, including error handling
 * for insufficient credits and other failures. Validates all required parameters
 * before attempting to start the conference.
 * 
 * @param params - Configuration object
 * @param params.userId - User ID initiating the conference
 * @param params.campaignId - Campaign ID for the conference
 * @param params.workspaceId - Workspace ID
 * @param params.callerId - Twilio caller ID to use
 * @param params.selectedDevice - Selected Twilio device identifier
 * 
 * @returns Object containing:
 *   - begin: Function to start the conference and dial
 *   - conference: Conference name/identifier if successfully started, null otherwise
 *   - setConference: Function to manually set conference name
 *   - creditsError: Boolean indicating if the error was due to insufficient credits
 *   - error: Error message string if an error occurred, null otherwise
 *   - isLoading: Boolean indicating if the conference is being started
 * 
 * @example
 * ```tsx
 * const {
 *   begin,
 *   conference,
 *   creditsError,
 *   error,
 *   isLoading
 * } = useStartConferenceAndDial({
 *   userId: user.id,
 *   campaignId: campaign.id,
 *   workspaceId: workspace.id,
 *   callerId: '+1234567890',
 *   selectedDevice: 'device-id'
 * });
 * 
 * // Start conference
 * await begin();
 * 
 * if (conference) {
 *   console.log('Conference started:', conference);
 * }
 * 
 * if (creditsError) {
 *   console.error('Insufficient credits');
 * }
 * ```
 */
const useStartConferenceAndDial = ({ userId, campaignId, workspaceId, callerId, selectedDevice }: { userId: string, campaignId: string, workspaceId: string, callerId: string, selectedDevice: string }) => {
    const [conference, setConference] = useState<string | null>(null);
    const [creditsError, setCreditsError] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    
    const begin = useCallback(async () => {
        // Validate required parameters
        if (!userId || !campaignId || !workspaceId || !callerId || !selectedDevice) {
            const missingParams = [];
            if (!userId) missingParams.push('userId');
            if (!campaignId) missingParams.push('campaignId');
            if (!workspaceId) missingParams.push('workspaceId');
            if (!callerId) missingParams.push('callerId');
            if (!selectedDevice) missingParams.push('selectedDevice');
            
            const errorMessage = `Missing required parameters: ${missingParams.join(', ')}`;
            console.error(errorMessage);
            setError(errorMessage);
            return;
        }

        setIsLoading(true);
        setError(null);
        setCreditsError(false);

        try {
            const startConferenceData = await startConferenceAndDial({
                user_id: userId,
                caller_id: callerId,
                workspace_id: workspaceId,
                campaign_id: campaignId,
                selected_device: selectedDevice,
            });
            
            if (startConferenceData.creditsError) {
                setCreditsError(true);
                setError('Insufficient credits to start conference');
                setIsLoading(false);
                return;
            }
            
            if (startConferenceData.success) {
                const conferenceName = startConferenceData.conferenceName;
                if (!conferenceName) {
                    throw new Error('Conference started but no conference name returned');
                }
                setConference(conferenceName);
                setError(null);
            } else {
                const errorMessage = startConferenceData.error || 'Failed to start conference';
                console.error('Failed to start conference:', errorMessage);
                setError(errorMessage);
            }
        } catch (error) {
            const errorMessage = error instanceof Error 
                ? error.message 
                : 'An unexpected error occurred during conference setup';
            console.error('Error during conference setup and dialing:', error);
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    }, [userId, campaignId, workspaceId, callerId, selectedDevice]);

    return { begin, conference, setConference, creditsError, error, isLoading };
};

export { useStartConferenceAndDial };
