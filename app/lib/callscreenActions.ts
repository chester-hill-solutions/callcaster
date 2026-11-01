import type { Dispatch, SetStateAction } from "react";
import { FetcherWithComponents } from "react-router";
import { getNextContact } from "./getNextContact";
import { Campaign, Contact, QueueItem, OutreachAttempt, Call   } from "./types";
import { isRecent } from "./utils";
import { isObject } from "./type-safety-utils";
import { logger } from "@/lib/logger.client";
import { manualDialFields, type StartCallArgs } from "@/lib/manual-dial-client";

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

export async function releaseCallSession(campaignId: number): Promise<void> {
  const response = await fetch(`/api/campaigns/${campaignId}/call-session/release`, {
    method: "POST",
  });
  if (!response.ok) throw new Error("Could not release campaign contacts");
  const result: unknown = await response.json();
  if (!isObject(result) || typeof result.released !== "number" || !Number.isInteger(result.released) || result.released < 0) {
    throw new Error("Could not confirm campaign contacts were released");
  }
}

export const handleCall = ({ submit }:{submit:FetcherWithComponents<unknown>["submit"]}) => {
  const startCall = (args: StartCallArgs) => {
    const fields = manualDialFields(args);
    if (fields) {
      const data = new FormData();
      for (const [key, value] of Object.entries(fields)) data.append(key, value);

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
    setRecentAttempt({ ...newRecentAttempt, call: recentCall ?? [] });
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

    setQuestionContact(nextContact);
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
      setRecentAttempt({ ...newRecentAttempt, call: recentCall ?? [] });
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
        campaign_id: campaign.id,
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
