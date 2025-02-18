import { useState } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import type { QueueItem } from "~/lib/types";

interface QueueManagerConfig {
  campaignId: string;
  workspaceId: string;
  userId: string;
  dialType: 'predictive' | 'call';
  groupByHousehold: boolean;
  supabase: SupabaseClient;
}

export function useQueueManagement({
  campaignId,
  workspaceId,
  userId,
  dialType,
  groupByHousehold,
  supabase
}: QueueManagerConfig) {
  // Core state
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentRecipient, setCurrentRecipient] = useState<QueueItem | null>(null);
  const [householdMap, setHouseholdMap] = useState<Map<string, QueueItem[]>>(new Map());

  // Queue operations
  async function fetchQueue() {
    const query = supabase
      .from("campaign_queue")
      .select(`*, contact:contact(*)`)
      .eq("campaign_id", campaignId);

    if (dialType === 'predictive') {
      query.in("status", ["queued", userId])
        .order("attempts", { ascending: true })
        .order("queue_order", { ascending: true });
    } else {
      query.eq("status", userId);
    }

    const { data, error } = await query.limit(50);
    
    if (!error && data) {
      setQueue(data as QueueItem[]);
      updateHouseholdMap(data as QueueItem[]);
    }
    
    return { data, error };
  }

  function updateHouseholdMap(items: QueueItem[]) {
    const map = new Map<string, QueueItem[]>();
    
    items.forEach(item => {
      const address = item.contact?.address;
      if (address) {
        if (!map.has(address)) {
          map.set(address, []);
        }
        const current = map.get(address) || [];
        map.set(address, [...current, item]);
      }
    });

    setHouseholdMap(map);
  }

  async function dequeueContact(contact: QueueItem) {
    const { error } = await supabase
      .from("campaign_queue")
      .update({ status: "completed" })
      .eq("id", contact.id);

    if (!error) {
      setQueue(current => current.filter(item => item.id !== contact.id));
      const newQueue = queue.filter(item => item.id !== contact.id);
      updateHouseholdMap(newQueue);
    }

    return { error };
  }

  function getNextContact(skipHousehold: boolean = false) {
    if (!currentRecipient || skipHousehold) {
      const next = queue[0];
      setCurrentRecipient(next || null);
      return next;
    }

    // If grouping by household, get next in household
    if (groupByHousehold && currentRecipient.contact?.address) {
      const household = householdMap.get(currentRecipient.contact.address) || [];
      const currentIndex = household.findIndex(item => item.id === currentRecipient.id);
      const nextInHousehold = household[currentIndex + 1];
      
      if (nextInHousehold) {
        setCurrentRecipient(nextInHousehold);
        return nextInHousehold;
      }
    }

    // Get next in queue
    const currentIndex = queue.findIndex(item => item.id === currentRecipient.id);
    const next = queue[currentIndex + 1];
    setCurrentRecipient(next || null);
    return next;
  }

  // Set up realtime subscription
  const channel = supabase
    .channel(`queue:${campaignId}`)
    .on('postgres_changes', { 
      event: '*', 
      schema: 'public', 
      table: 'campaign_queue',
      filter: `campaign_id=eq.${campaignId}`
    }, (payload) => {
      if (payload.eventType === 'INSERT') {
        setQueue(current => [...current, payload.new as QueueItem]);
        updateHouseholdMap([...queue, payload.new as QueueItem]);
      } else if (payload.eventType === 'DELETE') {
        setQueue(current => current.filter(item => item.id !== payload.old.id));
        updateHouseholdMap(queue.filter(item => item.id !== payload.old.id));
      } else if (payload.eventType === 'UPDATE') {
        setQueue(current => current.map(item => 
          item.id === payload.new.id ? { ...item, ...payload.new } : item
        ));
        updateHouseholdMap(queue.map(item => 
          item.id === payload.new.id ? { ...item, ...payload.new } : item
        ));
      }
    })
    .subscribe();

  return {
    // State
    queue,
    currentRecipient,
    householdMap,
    
    // Actions
    fetchQueue,
    dequeueContact,
    getNextContact,
    
    // Stats
    queueSize: queue.length,
    completedCount: queue.filter(item => item.status === 'completed').length,
    
    // Cleanup
    cleanup: () => {
      supabase.removeChannel(channel);
    }
  };
} 