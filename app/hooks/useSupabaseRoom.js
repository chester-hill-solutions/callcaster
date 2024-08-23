import { useEffect, useState, useCallback, useRef } from "react";

const PRESENCE_UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes

const useSupabaseRoom = ({ supabase, workspace, campaign, userId }) => {
    const [status, setStatus] = useState('offline');
    const [users, setUsers] = useState([]);
    const [predictiveState, setPredictiveState] = useState({ contact_id: null, status: "idle" });
    const channelRef = useRef(null);

    const updatePresence = useCallback(async (newStatus) => {
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
            await supabase
                .from('user')
                .update({ activity: activityUpdate })
                .eq('id', userId);
        } catch (error) {
            console.error('Error updating presence:', error);
        }
    }, [supabase, workspace, campaign, userId]);

    useEffect(() => {
        const roomName = `${userId}`;
        const room = supabase.channel(roomName);
        channelRef.current = room;

        const handleConnect = () => {
            setStatus('online');
            console.log(`Connected to ${roomName}`);
            updatePresence('online');
        };

        const handleDisconnect = () => {
            setStatus('offline');
            console.log(`Disconnected from ${roomName}`);
            updatePresence('offline');
        };

        room.on('connect', handleConnect)
            .on('disconnect', handleDisconnect)
            .on('error', (error) => {
                setStatus('error');
                console.error(`Error in ${roomName}:`, error);
            })
            .on('broadcast', { event: 'message' }, (e) => {
                setPredictiveState(e.payload)
            })
            .on('presence', setUsers)
            .subscribe();

        const presenceInterval = setInterval(() => {
            if (status === 'online') {
                updatePresence('online');
            }
        }, PRESENCE_UPDATE_INTERVAL);

        return () => {
            supabase.removeChannel(room);
            handleDisconnect();
            clearInterval(presenceInterval);
        };
    }, [supabase, userId, updatePresence, status]);

    return { status, users, predictiveState };
};

export default useSupabaseRoom;