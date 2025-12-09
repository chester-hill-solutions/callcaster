import { useEffect, useState, useCallback, useRef } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/lib/database.types";
import { logger } from "@/lib/logger.client";

const PRESENCE_UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes

interface PresenceUser {
    id: string;
    [key: string]: unknown;
}

interface PredictiveState {
    contact_id: number | null;
    status: string;
}

interface UseSupabaseRoomParams {
    supabase: SupabaseClient<Database>;
    workspace: string;
    campaign: number | undefined;
    userId: string;
}

interface UseSupabaseRoomReturn {
    status: 'offline' | 'online' | 'error';
    users: PresenceUser[];
    predictiveState: PredictiveState;
}

/**
 * Hook for managing Supabase realtime room presence and state
 * 
 * Creates a Supabase realtime channel for user presence tracking and predictive dialing
 * state synchronization. Automatically updates user activity in the database and tracks
 * online/offline status. Handles presence sync events and broadcast messages for
 * predictive dialing coordination.
 * 
 * Features:
 * - Automatic presence updates every 5 minutes when online
 * - Presence sync to track other users in the room
 * - Broadcast message handling for predictive state
 * - Connection status tracking (online/offline/error)
 * 
 * @param params - Configuration object
 * @param params.supabase - Supabase client instance
 * @param params.workspace - Workspace ID for activity tracking
 * @param params.campaign - Campaign ID (optional, required for presence updates)
 * @param params.userId - User ID for room channel and presence tracking
 * 
 * @returns Object containing:
 *   - status: Current connection status ('offline' | 'online' | 'error')
 *   - users: Array of users currently present in the room
 *   - predictiveState: Current predictive dialing state (contact_id and status)
 * 
 * @example
 * ```tsx
 * const { status, users, predictiveState } = useSupabaseRoom({
 *   supabase,
 *   workspace: workspaceId,
 *   campaign: campaignId,
 *   userId: user.id,
 * });
 * 
 * if (status === 'online') {
 *   console.log(`${users.length} users online`);
 * }
 * ```
 */
const useSupabaseRoom = ({ 
    supabase, 
    workspace, 
    campaign, 
    userId 
}: UseSupabaseRoomParams): UseSupabaseRoomReturn => {
    const [status, setStatus] = useState<'offline' | 'online' | 'error'>('offline');
    const [users, setUsers] = useState<PresenceUser[]>([]);
    const [predictiveState, setPredictiveState] = useState<PredictiveState>({ 
        contact_id: null, 
        status: "idle" 
    });
    const channelRef = useRef<ReturnType<SupabaseClient<Database>['channel']> | null>(null);
    const presenceIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const updatePresence = useCallback(async (newStatus: 'online' | 'offline') => {
        if (!campaign) return;
        
        const currentTime = new Date().toISOString();
        const activityUpdate = {
            workspace_id: workspace,
            campaigns: {
                [campaign]: {
                    campaign_id: campaign,
                    last_online: currentTime,
                    status: newStatus,
                },
            },
        };

        try {
            if (!userId) {
                console.error('Cannot update presence: userId is missing');
                return;
            }

            if (!workspace) {
                console.error('Cannot update presence: workspace is missing');
                return;
            }

            const { error } = await supabase
                .from('user')
                .update({ activity: activityUpdate })
                .eq('id', userId);
            
            if (error) {
                console.error('Error updating presence:', error);
                setStatus('error');
            }
        } catch (error) {
            console.error('Error updating presence:', error);
            setStatus('error');
        }
    }, [supabase, workspace, campaign, userId]);

    useEffect(() => {
        const roomName = `${userId}`;
        const room = supabase.channel(roomName);
        channelRef.current = room;

        const handleConnect = () => {
            setStatus('online');
            logger.debug(`Connected to ${roomName}`);
            updatePresence('online');
        };

        const handleDisconnect = () => {
            setStatus('offline');
            logger.debug(`Disconnected from ${roomName}`);
            updatePresence('offline');
        };

        room.on('connect', handleConnect)
            .on('disconnect', handleDisconnect)
            .on('error', (error: Error) => {
                setStatus('error');
                console.error(`Error in ${roomName}:`, error);
            })
            .on('broadcast', { event: 'message' }, (e) => {
                try {
                    if (!e || !e.payload) {
                        console.warn('Invalid broadcast payload received');
                        return;
                    }
                    setPredictiveState(e.payload as PredictiveState);
                } catch (error) {
                    console.error('Error handling broadcast message:', error);
                }
            })
            .on('presence', { event: 'sync' }, () => {
                try {
                    const state = room.presenceState();
                    if (!state) {
                        console.warn('Presence state is null or undefined');
                        setUsers([]);
                        return;
                    }
                    const usersArray: PresenceUser[] = Object.values(state).flat() as PresenceUser[];
                    setUsers(usersArray);
                } catch (error) {
                    console.error('Error handling presence sync:', error);
                    setUsers([]);
                }
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    logger.debug(`Successfully subscribed to ${roomName}`);
                } else if (status === 'CHANNEL_ERROR') {
                    console.error(`Failed to subscribe to ${roomName}`);
                    setStatus('error');
                } else if (status === 'TIMED_OUT') {
                    console.error(`Subscription to ${roomName} timed out`);
                    setStatus('error');
                } else if (status === 'CLOSED') {
                    logger.debug(`Subscription to ${roomName} closed`);
                    setStatus('offline');
                }
            });

        presenceIntervalRef.current = setInterval(() => {
            if (status === 'online') {
                updatePresence('online');
            }
        }, PRESENCE_UPDATE_INTERVAL);

        return () => {
            if (presenceIntervalRef.current) {
                clearInterval(presenceIntervalRef.current);
                presenceIntervalRef.current = null;
            }
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
            handleDisconnect();
        };
    }, [supabase, userId, updatePresence, status]);

    return { status, users, predictiveState };
};

export default useSupabaseRoom;

