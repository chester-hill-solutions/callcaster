import { NavigateFunction } from "@remix-run/react";
import { Fetcher, SubmitFunction } from "@remix-run/react";
import { useEffect, useState } from "react";
import { Audience, CampaignAudience, Schedule, Script } from "~/lib/types";
import { deepEqual } from "~/lib/utils";
import { Tables, Database } from "~/lib/database.types";

type Contact = Tables<"contact">;
type QueueItem = Tables<"campaign_queue"> & { contact: Contact };
type LiveCampaign = Tables<"live_campaign"> & { script: Script };
type MessageCampaign = Tables<"message_campaign">;
type IVRCampaign = Tables<"ivr_campaign"> & { script: Script };



export type CampaignUIState = {
    isChanged: boolean;
    confirmStatus: "play" | "pause" | "archive" | "none";
    scheduleDisabled: string | boolean;
    joinDisabled: string | null;
};

export type CampaignSettingsData = {
    instructions?: {
        join?: string;
        script?: string;
    };
    [key: string]: any;
};

/**
 * Hook for managing campaign settings state and updates
 * 
 * Provides state management for campaign configuration including audiences, schedules,
 * scripts, and status. Handles form state tracking, validation, and saving via Remix fetcher.
 * Automatically tracks changes and provides UI state for confirmation dialogs.
 * 
 * @param params - Configuration object
 * @param params.initialState - Initial campaign state (from loader)
 * @param params.navigate - Remix navigate function for redirects
 * @param params.fetcher - Remix fetcher for submitting campaign updates
 * 
 * @returns Object containing:
 *   - state: Current campaign state
 *   - uiState: UI state for confirmations and form status
 *   - isLoading: Boolean indicating if save operation is in progress
 *   - updateCampaignField: Function to update a specific campaign field
 *   - resetState: Function to reset state to initial values
 *   - handleAudienceChange: Function to handle audience selection changes
 *   - handleStatusButtons: Function to handle campaign status button clicks
 *   - handleConfirmStatus: Function to handle confirmation status changes
 *   - handleSave: Function to save campaign changes
 * 
 * @example
 * ```tsx
 * const {
 *   state,
 *   uiState,
 *   isLoading,
 *   updateCampaignField,
 *   handleSave
 * } = useCampaignSettings({
 *   initialState: campaignData,
 *   navigate,
 *   fetcher
 * });
 * 
 * // Update a field
 * updateCampaignField('name', 'New Campaign Name');
 * 
 * // Check if form has changes
 * if (uiState.isChanged) {
 *   // Show save button
 * }
 * 
 * // Save changes
 * handleSave();
 * ```
 */
export function useCampaignSettings({
    initialState,
    navigate,
    fetcher,
}: {
    initialState: CampaignState;
    navigate: NavigateFunction;
    fetcher: Fetcher<{success?: boolean, campaign?: Partial<CampaignState>, campaignDetails?: CampaignState['details']}> & { submit: SubmitFunction };
}) {
    // Validate required parameters
    if (!initialState) {
        throw new Error('useCampaignSettings: initialState is required');
    }
    if (typeof navigate !== 'function') {
        throw new Error('useCampaignSettings: navigate must be a function');
    }
    if (!fetcher || typeof fetcher.submit !== 'function') {
        throw new Error('useCampaignSettings: fetcher must be a valid Fetcher with submit method');
    }

    const [state, setState] = useState<CampaignState>(initialState);
    const [uiState, setUIState] = useState<CampaignUIState>({
        isChanged: false,
        confirmStatus: "none",
        scheduleDisabled: false,
        joinDisabled: null,
    });

    // Expose loading state from fetcher
    const isLoading = fetcher.state === 'submitting' || fetcher.state === 'loading';

    useEffect(() => {
        if (!deepEqual(state, initialState)) {
            setUIState(prev => ({ ...prev, isChanged: true }));
        } else {
            setUIState(prev => ({ ...prev, isChanged: false }));
        }
    }, [state, initialState]);

    const updateCampaignField = <K extends keyof CampaignState>(field: K, value: CampaignState[K]) => {
        setState(prev => ({
            ...prev,
            [field]: value,
        }));
    };

    const resetState = () => {
        setState(initialState);
        setUIState(prev => ({ ...prev, isChanged: false }));
    };

    const handleAudienceChange = (audience: NonNullable<CampaignAudience>, isChecked: boolean) => {
        if (!audience) return;
        const newAudiences = isChecked
            ? [...state.audiences, { id: audience.audience_id } as NonNullable<Audience>]
            : state.audiences.filter(a => a.id !== audience.audience_id);
        updateCampaignField("audiences", newAudiences);
    };

    const handleStatusButtons = (type: "play" | "pause" | "archive" | "schedule") => {
        if (type === "schedule") {
            navigate("schedule");
            return;
        }
        if (type === "pause") {
            const updatedState = {
                ...state,
                status: "paused",
                is_active: false
            };
            setState(updatedState);
            fetcher.submit(
                {
                    campaignData: JSON.stringify(updatedState),
                    campaignDetails: JSON.stringify(state.details),
                },
                { method: "patch", action: "/api/campaigns" }
            );
            setUIState(prev => ({ ...prev, confirmStatus: "none" }));
            return;
        }
        setUIState(prev => ({ ...prev, confirmStatus: type }));
    };

    const handleConfirmStatus = (status: "play" | "pause" | "archive" | "none") => {
        if (status === "none" && uiState.confirmStatus !== "none") {
            const newStatus = uiState.confirmStatus === "play" ? "running" :
                            uiState.confirmStatus === "archive" ? "archived" :
                            state.status;
            
            const updatedState = {
                ...state,
                status: newStatus,
                is_active: newStatus === "running"
            };

            setState(updatedState);
            fetcher.submit(
                {
                    campaignData: JSON.stringify(updatedState),
                    campaignDetails: JSON.stringify(state.details),
                },
                { method: "patch", action: "/api/campaigns" }
            );
        }
        setUIState(prev => ({ ...prev, confirmStatus: status }));
    };

    const handleSave = () => {
        fetcher.submit(
            {
                campaignData: JSON.stringify(state),
                campaignDetails: JSON.stringify(state.details),
            },
            { method: "patch", action: "/api/campaigns" }
        );
    };

    useEffect(() => {
        const data = fetcher.data;
        if (fetcher.state === 'idle' && data) {
            if (data.success && data.campaign && data.campaignDetails) {
                setUIState(prev => ({ ...prev, isChanged: false }));
                setState(prevState => ({
                    ...prevState,
                    ...(data.campaign as Partial<CampaignState>),
                    details: data.campaignDetails as CampaignState['details']
                }));
            } else if (data.error || (!data.success && data.campaign === undefined)) {
                // Handle API failure
                console.error('Campaign update failed:', data.error || 'Unknown error');
                // Optionally show error to user or revert state
            }
        }
    }, [fetcher.state, fetcher.data]);

    return {
        state,
        uiState,
        isLoading,
        updateCampaignField,
        resetState,
        handleAudienceChange,
        handleStatusButtons,
        handleConfirmStatus,
        handleSave,
    };
}