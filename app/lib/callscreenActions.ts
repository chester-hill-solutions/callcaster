import { getNextContact } from "./getNextContact";
import { isRecent } from "./utils";

const getRecentAttempt = ({ attempts, contact }) => {
  return attempts.find((call) => call.contact_id === contact.contact.id) || {};
};
const getAttemptCalls = ({ attempt, calls }) => {
  return calls.filter((call) => call.outreach_attempt_id === attempt.id);
};

export const handleConference = ({ submit, begin }) => {
  const handleConferenceStart = () => {
    begin();
  };

  const handleConferenceEnd = ({ activeCall, setConference, workspaceId }) => {
    submit(
      {workspaceId},
      { method: "post", action: "/api/auto-dial/end", navigate: false, encType:'application/json' },
    );
    if (activeCall?.parameters?.CallSid) {
      fetch(`/api/hangup`, {
        method: "POST",
        body: JSON.stringify({ callSid: activeCall.parameters.CallSid, workspaceId }),
        headers: { "Content-Type": "application/json" },
      });
    }
    setConference({});
  };
  return { handleConferenceStart, handleConferenceEnd };
};

export const handleCall = ({ submit }) => {
  const startCall = ({
    contact,
    campaign,
    user,
    workspaceId,
    nextRecipient,
    recentAttempt,
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
      };
      submit(data, {
        action: "/api/dial",
        method: "POST",
        encType: "application/json",
        navigate: false,
        fetcherKey: "place-call",
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
  const switchQuestionContact = ({ contact }) => {
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
    const newRecentAttempt = getRecentAttempt({
      attempts,
      contact: nextContact,
    });
    if (!isRecent(newRecentAttempt.created_at)) {
      setRecentAttempt({});
      setUpdate({});
      return nextContact;
    } else {
      const recentCalls = getAttemptCalls({ attempt: newRecentAttempt, calls });
      setRecentAttempt({ ...newRecentAttempt, call: recentCalls });
      setUpdate(newRecentAttempt.result || {});
      }
  };
  return { switchQuestionContact, nextNumber };
};

export const handleQueue = ({
  fetcher,
  submit,
  groupByHousehold,
  campaign,
  workspaceId,
}) => {
  const dequeue = ({ contact }) => {
    submit(
      {
        contact_id: contact.contact.id,
        household: groupByHousehold,
      },
      {
        action: "/api/queues",
        method: "POST",
        encType: "application/json",
        navigate: false,
        fetcherKey: "dequeue",
      },
    );
  };
  const fetchMore = ({ householdMap }) => {
    const map = {...householdMap};
    const length = Math.max(0, 5 - Object.keys(map).length)
    fetcher.load(
      `/api/queues?campaign_id=${campaign.id}&workspace_id=${workspaceId}&limit=${length}`,
      {
        navigate: false,
      },
    );
  };
  return { dequeue, fetchMore };
};
