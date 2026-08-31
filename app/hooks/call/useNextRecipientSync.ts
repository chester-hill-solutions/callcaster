import { useEffect } from "react";
import type { QueueItem } from "@/lib/types";

type UseNextRecipientSyncOptions = {
  nextRecipient: QueueItem | null;
  /**
   * True while the header should keep showing the current call subject: a
   * non-predictive call is dialing/connected, or its outcome is still on
   * screen awaiting the agent's disposition (#1458). While held, the queue
   * pointer may advance underneath; the sync catches up when the hold lifts
   * (Save and Next / beginDial reset the FSM, which flips displayState back
   * to idle).
   */
  holdAdvance: boolean;
  send: (action: { type: string }) => void;
  setQuestionContact: (contact: QueueItem | null) => void;
  setCallDuration: (duration: number) => void;
};

/**
 * When queue advances next recipient, sync questionnaire contact and state machine.
 */
export function useNextRecipientSync({
  nextRecipient,
  holdAdvance,
  send,
  setQuestionContact,
  setCallDuration,
}: UseNextRecipientSyncOptions) {
  /**
   * @effect When the queue-provided next recipient advances, sync the
   * questionnaire panel's contact and reset the call state machine and
   * duration for the upcoming call — but not while a call subject is still
   * on screen (holdAdvance), so a hangup-triggered dequeue can't swap the
   * header to the next contact mid-disposition (#1458).
   * @effect-deps nextRecipient, holdAdvance (re-fires when the hold lifts so
   * a queue advance that landed mid-call is applied then), send,
   * setCallDuration, setQuestionContact
   * @effect-side-effects none (dispatches to state setters/reducer passed in;
   * no direct timer/subscription/DOM/fetch of its own)
   * @effect-why-not-loader nextRecipient is already realtime/loader-sourced
   * state owned elsewhere (useWorkspaceRealtime, usePredictiveCallSync,
   * useCampaignQueueFlow); this effect is the single place that reacts to it
   * changing regardless of which of those producers changed it, so the
   * questionnaire/FSM reset logic isn't duplicated at every call site.
   */
  useEffect(() => {
    if (!nextRecipient) return;
    if (holdAdvance) return;
    setQuestionContact(nextRecipient);
    send({ type: "NEXT" });
    setCallDuration(0);
  }, [nextRecipient, holdAdvance, send, setCallDuration, setQuestionContact]);
}
