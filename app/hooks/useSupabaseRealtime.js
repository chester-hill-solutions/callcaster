import { useEffect, useState } from "react";

export function useSupabaseRealtime(table, supabase, init = []) {
    const [data, setData] = useState(init);

    useEffect(() => {
        const subscription = supabase
            .channel(`*`)
            .on('postgres_changes', { event: '*', schema: 'public', table: table }, (payload) => {
                const updatedData = payload.new;
                setData((currentData) => {
                    const index = table === 'call'
                        ? currentData.findIndex(item => item.sid === updatedData.sid)
                        : currentData.findIndex(item => item.id === updatedData.id);
                    
                    if (index > -1) {
                        const newData = [...currentData];
                        newData[index] = updatedData;
                        return newData;
                    }
                    return [updatedData, ...currentData];
                });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [table, supabase]);

    return [data, setData];
}
