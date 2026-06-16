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
}: UsePredictiveCallSyncOptions) {
  useEffect(() => {
    if (predictiveState.contact_id && predictiveState.status) {
      const contact = queue.find(
        (c) => c.contact_id === predictiveState.contact_id,
      );
      if (contact) setNextRecipient(contact);

      switch (predictiveState.status) {
        case "dialing":
          send({ type: "START_DIALING" });
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
          send({ type: "NEXT" });
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
  ]);
}
