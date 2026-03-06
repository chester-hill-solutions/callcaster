import type { Dispatch, SetStateAction } from "react";
import { FetcherWithComponents } from "@remix-run/react";
import { getNextContact } from "./getNextContact";
import { Campaign, Contact, QueueItem, ActiveCall, OutreachAttempt, Call   } from "./types";
import { isRecent } from "./utils";
import { isObject } from "./type-utils";
import { logger } from "@/lib/logger.client";

const getRecentAttempt = ({
  attempts,
  contact,
}: {
  attempts: OutreachAttempt[];
  contact: QueueItem;
}): OutreachAttempt | null => {
  return attempts.find((attempt) => attempt.contact_id === contact.contact.id) ?? null;
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
    setConference();
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
  }: {
    contact: Contact;
    campaign: Campaign;
    user: { id: string };
    workspaceId: string;
    nextRecipient: QueueItem | null;
    recentAttempt: OutreachAttempt | null;
    selectedDevice: string | null;
  }) => {
    if (contact.phone) {
      const data = new FormData();
      data.append("to_number", contact.phone);
      data.append("campaign_id", campaign.id.toString());
      data.append("user_id", user.id);
      data.append("contact_id", contact.id.toString());
      data.append("workspace_id", workspaceId);
      if (recentAttempt?.id != null) {
        data.append("outreach_id", recentAttempt.id.toString());
      }
      if (nextRecipient?.id != null) {
        data.append("queue_id", nextRecipient.id.toString());
      }
      if (campaign.caller_id) {
        data.append("caller_id", campaign.caller_id);
      }
      if (selectedDevice) {
        data.append("selected_device", selectedDevice);
      }

      submit(data, {
        action: "/api/dial",
        method: "POST",
      });
    }
  };
  return { startCall };
};

export const handleContact = ({
  setQuestionContact,
  setRecentAttempt,
  setUpdate,
  setNextRecipient,
  attempts,
  calls,
}: {
  setQuestionContact: (contact: QueueItem | null) => void;
  setRecentAttempt: (attempt: OutreachAttempt | null) => void;
  setUpdate: (update: Record<string, unknown> | null) => void;
  setNextRecipient: (recipient: QueueItem | null) => void;
  attempts: OutreachAttempt[];
  calls: Call[];
}) => {
  const switchQuestionContact = ({ contact }:{contact:QueueItem}) => {
    setQuestionContact(contact);
    const newRecentAttempt = getRecentAttempt({ attempts, contact });
    if (!newRecentAttempt || !isRecent(newRecentAttempt.created_at)) {
      setRecentAttempt(null);
      setUpdate(null);
      return contact;
    }
    const recentCalls = getAttemptCalls({ attempt: newRecentAttempt, calls });
    const recentCall = recentCalls[0];
    if (!recentCall) {
      setRecentAttempt(null);
      setUpdate(null);
      return contact;
    }
    setRecentAttempt({ ...newRecentAttempt, call: recentCall });
    setUpdate(isObject(newRecentAttempt.result) ? newRecentAttempt.result : null);
    return contact;
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
    householdMap: Record<string, QueueItem[]>;
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

    if (newRecentAttempt && isRecent(newRecentAttempt.created_at)) {
      const recentCalls = getAttemptCalls({ attempt: newRecentAttempt, calls });
      const recentCall = recentCalls[0];
      if (!recentCall) {
        setRecentAttempt(null);
        return;
      }
      setRecentAttempt({ ...newRecentAttempt, call: recentCall });
      setUpdate(isObject(newRecentAttempt.result) ? newRecentAttempt.result : null);
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
  setQueue: Dispatch<SetStateAction<QueueItem[]>>;
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
      prevQueue.forEach((contact) => {
        const address = contact.contact.address ?? `ADDRESS_${contact.contact.id}`;
        if (!existingHouseholds.has(address)) {
          existingHouseholds.set(address, []);
        }
        existingHouseholds.get(address)?.push(contact);
      });

      newContacts.forEach((newContact) => {
        const address = newContact.contact.address || `ADDRESS_${newContact.contact.id}`;
        if (existingHouseholds.has(address)) {
          const household = existingHouseholds.get(address);
          if (household && !household.some((c) => c.id === newContact.id)) {
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
