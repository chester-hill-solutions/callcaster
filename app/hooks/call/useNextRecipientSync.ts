import { useEffect } from "react";
import type { QueueItem } from "@/lib/types";

type UseNextRecipientSyncOptions = {
  nextRecipient: QueueItem | null;
  send: (action: { type: string }) => void;
  setQuestionContact: (contact: QueueItem | null) => void;
  setCallDuration: (duration: number) => void;
};

/**
 * When queue advances next recipient, sync questionnaire contact and state machine.
 */
export function useNextRecipientSync({
  nextRecipient,
  send,
  setQuestionContact,
  setCallDuration,
}: UseNextRecipientSyncOptions) {
  useEffect(() => {
    if (nextRecipient) {
      setQuestionContact(nextRecipient);
      send({ type: "NEXT" });
      setCallDuration(0);
    }
  }, [nextRecipient, send, setCallDuration, setQuestionContact]);
}
