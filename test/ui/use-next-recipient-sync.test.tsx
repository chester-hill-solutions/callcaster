import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { useNextRecipientSync } from "@/hooks/call/useNextRecipientSync";
import type { QueueItem } from "@/lib/types";

const contactA = { id: "q1", contact_id: 1 } as unknown as QueueItem;
const contactB = { id: "q2", contact_id: 2 } as unknown as QueueItem;

function setup(initial: { nextRecipient: QueueItem | null; holdAdvance: boolean }) {
  const send = vi.fn();
  const setQuestionContact = vi.fn();
  const setCallDuration = vi.fn();
  const view = renderHook(
    (props: { nextRecipient: QueueItem | null; holdAdvance: boolean }) =>
      useNextRecipientSync({
        ...props,
        send,
        setQuestionContact,
        setCallDuration,
      }),
    { initialProps: initial },
  );
  return { ...view, send, setQuestionContact, setCallDuration };
}

describe("useNextRecipientSync hold (#1458)", () => {
  test("a queue advance during a call does not swap the header contact; it applies when the hold lifts", () => {
    const { rerender, setQuestionContact, send } = setup({
      nextRecipient: contactA,
      holdAdvance: false,
    });
    expect(setQuestionContact).toHaveBeenLastCalledWith(contactA);

    // Call starts (dialing/connected/terminal-awaiting-save): hold is on.
    rerender({ nextRecipient: contactA, holdAdvance: true });
    // Hangup-triggered dequeue advances the queue pointer mid-call.
    rerender({ nextRecipient: contactB, holdAdvance: true });
    // Recorded contact sequence must not contain the mid-call swap.
    expect(setQuestionContact.mock.calls.map(([c]) => c)).toEqual([contactA]);

    // Agent hands off (Save and Next / beginDial) — displayState back to idle.
    rerender({ nextRecipient: contactB, holdAdvance: false });
    expect(setQuestionContact.mock.calls.map(([c]) => c)).toEqual([
      contactA,
      contactB,
    ]);
    expect(send).toHaveBeenCalledWith({ type: "NEXT" });
  });

  test("no recipient means no sync, held or not", () => {
    const { rerender, setQuestionContact } = setup({
      nextRecipient: null,
      holdAdvance: false,
    });
    rerender({ nextRecipient: null, holdAdvance: true });
    expect(setQuestionContact).not.toHaveBeenCalled();
  });
});
