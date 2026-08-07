import { useEffect } from "react";
import type { QueueItem } from "@/lib/types";

type PredictiveState = {
  contact_id: number | null;
  status: string;
};

type UsePredictiveCallSyncOptions = {
  predictiveState: PredictiveState;
  queue: QueueItem[];
  nextRecipient: QueueItem | null;
  send: (action: { type: string }) => void;
  setNextRecipient: (recipient: QueueItem | null) => void;
  setUpdate: (update: Record<string, unknown> | null) => void;
  conference: string | null;
};

/**
 * Syncs predictive dialer room state with call screen recipient and state machine.
 */
export function usePredictiveCallSync({
  predictiveState,
  queue,
  nextRecipient,
  send,
  setNextRecipient,
  setUpdate,
  conference,
}: UsePredictiveCallSyncOptions) {
  /**
   * @effect Bridge predictive-dialer room state (pushed via the workspace SSE
   * stream, see useCallRoom) into the local call state machine: advance the
   * next recipient and dispatch the matching FSM transition for each dialer
   * status, and clear the pending questionnaire update when the dialer starts
   * dialing a different (or no) contact.
   * @effect-deps predictiveState, queue, nextRecipient?.contact_id, send,
   * setNextRecipient, setUpdate (reacts to every server-pushed predictive
   * status/contact change and needs the current queue to resolve the contact
   * and the current nextRecipient to detect a contact swap)
   * @effect-side-effects none (dispatches to state setters/reducer passed in;
   * no direct timer/subscription/DOM/fetch of its own)
   * @effect-why-not-loader predictiveState already arrives via a realtime SSE
   * push (not a request this hook makes); this effect is the single point that
   * reacts to that pushed value regardless of who else observes it, mirroring
   * it into local FSM/UI state is exactly what an effect is for.
   */
  useEffect(() => {
    if (predictiveState.contact_id && predictiveState.status) {
      const contact = queue.find(
        (c) => c.contact_id === predictiveState.contact_id,
      );
      if (contact) setNextRecipient(contact);

      switch (predictiveState.status) {
        case "dialing":
          if (conference) send({ type: "START_DIALING" });
          break;
        case "connected":
          send({ type: "CONNECT" });
          break;
        case "completed":
        case "failed":
        case "no-answer":
          send({ type: "HANG_UP" });
          break;
        default:
          break;
      }
    }
    if (!predictiveState.contact_id && predictiveState.status === "dialing") {
      setUpdate(null);
    }
    if (
      predictiveState.contact_id !== nextRecipient?.contact_id &&
      predictiveState.status === "dialing"
    ) {
      setUpdate(null);
    }
  }, [
    predictiveState,
    send,
    queue,
    setNextRecipient,
    nextRecipient?.contact_id,
    setUpdate,
    conference,
  ]);
}
