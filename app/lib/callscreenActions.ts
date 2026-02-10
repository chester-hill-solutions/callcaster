import { FetcherWithComponents } from "@remix-run/react";
import { getNextContact } from "./getNextContact";
import { Campaign, Contact, QueueItem, ActiveCall, OutreachAttempt, Call   } from "./types";
import { isRecent } from "./utils";
import { logger } from "@/lib/logger.client";

const getRecentAttempt = ({ attempts, contact }:{attempts:OutreachAttempt[], contact:Contact}) => {
  return attempts.find((call) => call.contact_id === contact?.contact?.id) || {};
};
const getAttemptCalls = ({ attempt, calls }:{attempt:OutreachAttempt, calls:Call[]}) => {
  return calls.filter((call) => call.outreach_attempt_id === attempt.id);
};

export const handleConference = ({ submit, begin }:{submit:FetcherWithComponents<unknown>["submit"], begin:() => void}) => {
  const handleConferenceStart = () => {
    begin();
  };

  const handleConferenceEnd = ({ activeCall, setConference, workspaceId }:{activeCall:ActiveCall, setConference:() => void, workspaceId:string}) => {
    submit(
      { workspaceId },
      {
        method: "post",
        action: "/api/auto-dial/end",
        encType: "application/json",
      },
    );
    if (activeCall?.parameters?.CallSid) {
      fetch(`/api/hangup`, {
        method: "POST",
        body: JSON.stringify({
          callSid: activeCall.parameters.CallSid,
          workspaceId,
        }),
        headers: { "Content-Type": "application/json" },
      });
    }
    setConference({});
  };
  return { handleConferenceStart, handleConferenceEnd };
};

export const handleCall = ({ submit }:{submit:FetcherWithComponents<unknown>["submit"]}) => {
  const startCall = ({
    contact,
    campaign,
    user,
    workspaceId,
    nextRecipient,
    recentAttempt,
    selectedDevice,
  }) => {
    if (contact.phone) {
      const data = {
        to_number: contact.phone,
        campaign_id: campaign.id,
        user_id: user.id,
        contact_id: contact.id,
        workspace_id: workspaceId,
        outreach_id: recentAttempt?.id,
        queue_id: nextRecipient?.id,
        caller_id: campaign.caller_id,
        selected_device: selectedDevice,
      };

      submit(data, {
        action: "/api/dial",
        method: "POST",
        encType: "application/json",
      });
    }
  };
  const dialNext = () => {};
  return { startCall };
};

export const handleContact = ({
  setQuestionContact,
  setRecentAttempt,
  setUpdate,
  setNextRecipient,
  attempts,
  calls,
}) => {
  const switchQuestionContact = ({ contact }:{contact:Contact}) => {
    setQuestionContact(contact);
    const newRecentAttempt = getRecentAttempt({ attempts, contact });
    if (!isRecent(newRecentAttempt.created_at)) {
      setRecentAttempt(null);
      setUpdate(null);
      return contact;
    }
    const recentCalls = getAttemptCalls({ attempt: newRecentAttempt, calls });
    setRecentAttempt({ ...newRecentAttempt, call: recentCalls });
    setUpdate(newRecentAttempt.result || null);
  };
  const nextNumber = ({
    skipHousehold = false,
    queue,
    householdMap,
    nextRecipient,
    groupByHousehold,
  }: {
    skipHousehold: boolean;
    queue: QueueItem[];
    householdMap: Map<string, QueueItem[]>;
    nextRecipient: QueueItem | null;
    groupByHousehold: boolean;
  }) => {
    const nextContact = getNextContact(
      queue,
      householdMap,
      nextRecipient,
      groupByHousehold,
      skipHousehold,
    );
    if (!nextContact) return;

    setNextRecipient(nextContact);
    setRecentAttempt(null);
    setUpdate({});
    const newRecentAttempt = getRecentAttempt({
      attempts,
      contact: nextContact,
    });

    if (isRecent(newRecentAttempt.created_at)) {
      const recentCalls = getAttemptCalls({ attempt: newRecentAttempt, calls });
      setRecentAttempt({ ...newRecentAttempt, call: recentCalls });
      setUpdate(newRecentAttempt.result || {});
    }
  };

  return { switchQuestionContact, nextNumber };
};

export const handleQueue = ({
  submit,
  groupByHousehold,
  campaign,
  workspaceId,
  setQueue,
}:{
  submit: FetcherWithComponents<unknown>["submit"];  
  groupByHousehold: boolean;
  campaign: Campaign;
  workspaceId: string;
  setQueue: (queue: QueueItem[]) => void;
}) => {
  const dequeue = ({ contact }:{contact:QueueItem }) => {
    if (!contact || !contact.contact || !contact.contact.phone) return;
    submit(
      {
        contact_id: contact.contact.id,
        household: groupByHousehold,
      },
      {
        action: "/api/queues",
        method: "POST",
        encType: "application/json",
      },
    );
    setQueue((prevQueue) => {
      return prevQueue.filter(
        (queueContact) => queueContact.contact.id !== contact.contact.id,
      );
    });
  };

  const updateQueue = (newContacts: QueueItem[]) => {
    setQueue((prevQueue) => {
      const existingHouseholds = new Map<string, QueueItem[]>();
      prevQueue?.forEach((contact) => {
        const address = contact.contact.address;
        if (!existingHouseholds.has(address)) {
          existingHouseholds.set(address, []);
        }
        existingHouseholds.get(address).push(contact);
      });

      newContacts?.forEach((newContact) => {
        const address = newContact.contact.address || `ADDRESS_${newContact.contact.id}`;
        if (existingHouseholds.has(address)) {
          const household = existingHouseholds.get(address);
          if (!household.some((c) => c.queue_id === newContact.queue_id)) {
            household.push(newContact);
          }
        } else {
          existingHouseholds.set(address, [newContact]);
        }
      }); 
      return Array.from(existingHouseholds.values()).flat();
    });
  };

  const fetchMore = async ({ householdMap }: { householdMap: Record<string, QueueItem[]> }) => {
    const map = { ...householdMap };
    const length = Math.max(0, 10 - Object.keys(map).length);
    const res = await fetch(
      `/api/queues?campaign_id=${campaign.id}&workspace_id=${workspaceId}&limit=${length}`,
    )
      .then((res) => res.json())
      .then((json) => updateQueue(json))
      .catch((error) => logger.error("Unable to fetch queue: ", error));
  };
  return { dequeue, fetchMore };
};
