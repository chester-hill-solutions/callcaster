import { useEffect, useState, useCallback } from "react";

const useSupabaseRoom = ({ supabase, workspace, campaign, userId }) => {
    const [status, setStatus] = useState('offline');
    const [channel, setChannel] = useState(null);
    const [users, setUsers] = useState([]);

    const updatePresence = useCallback(async (status) => {
        const currentTime = new Date().toISOString();
        const activityUpdate = {
            workspace_id: workspace,
            campaigns: {
                [campaign]: {
                    campaign_id: campaign,
                    last_online: currentTime,
                    status: status,
                },
            },
        };

        const { error } = await supabase
            .from('user')
            .update({ activity: activityUpdate })
            .eq('id', userId);

        if (error) {
            console.error('Error updating presence:', error);
        }
    }, [supabase, workspace, campaign, userId]);

    useEffect(() => {
        const roomName = `${workspace}-${campaign}`;
        const room = supabase.channel(roomName);
        setChannel(room);

        const handleConnect = async () => {
            setStatus('online');
            console.log(`Connected to ${roomName}`);
            await updatePresence('online');
        };

        const handleDisconnect = async () => {
            setStatus('offline');
            console.log(`Disconnected from ${roomName}`);
            await updatePresence('offline');
        };

        const handleError = (error) => {
            setStatus('error');
            console.error(`Error in ${roomName}:`, error);
        };

        const handleMessage = (payload) => {
            console.log(`Message in ${roomName}:`, payload);
        };

        const handlePresence = (presenceEvent) => {
            setUsers(presenceEvent);
        };

        room.on('connect', handleConnect)
            .on('disconnect', handleDisconnect)
            .on('error', handleError)
            .on('broadcast', { event: 'message' }, handleMessage)
            .on('presence', handlePresence)
            .subscribe();

        const presenceInterval = setInterval(() => {
            if (status === 'online') {
                updatePresence('online');
            }
        }, 5 * 60 * 1000);

        return () => {
            supabase.removeChannel(room);
            handleDisconnect(); // Ensure presence is updated on cleanup
            clearInterval(presenceInterval); // Clear the interval on cleanup
        };
    }, [supabase, workspace, campaign, userId, updatePresence, status]);

    return { status, users };
};

export default useSupabaseRoom;
