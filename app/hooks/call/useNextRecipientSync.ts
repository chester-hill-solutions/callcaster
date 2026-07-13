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
  /**
   * @effect When the queue-provided next recipient advances, sync the
   * questionnaire panel's contact and reset the call state machine and
   * duration for the upcoming call.
   * @effect-deps nextRecipient, send, setCallDuration, setQuestionContact
   * (fires whenever the recipient identity changes, from any producer —
   * realtime queue push, predictive sync, or manual dequeue)
   * @effect-side-effects none (dispatches to state setters/reducer passed in;
   * no direct timer/subscription/DOM/fetch of its own)
   * @effect-why-not-loader nextRecipient is already realtime/loader-sourced
   * state owned elsewhere (useWorkspaceRealtime, usePredictiveCallSync,
   * useCampaignQueueFlow); this effect is the single place that reacts to it
   * changing regardless of which of those producers changed it, so the
   * questionnaire/FSM reset logic isn't duplicated at every call site.
   */
  useEffect(() => {
    if (nextRecipient) {
      setQuestionContact(nextRecipient);
      send({ type: "NEXT" });
      setCallDuration(0);
    }
  }, [nextRecipient, send, setCallDuration, setQuestionContact]);
}
