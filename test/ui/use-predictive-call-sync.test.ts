import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { usePredictiveCallSync } from "@/hooks/call/usePredictiveCallSync";
import type { QueueItem } from "@/lib/types";

type HookProps = Parameters<typeof usePredictiveCallSync>[0];

function baseProps(overrides: Partial<HookProps> = {}): HookProps {
  return {
    predictiveState: { contact_id: null, status: "idle" },
    queue: [],
    nextRecipient: null,
    send: vi.fn(),
    setNextRecipient: vi.fn(),
    setUpdate: vi.fn(),
    ...overrides,
  };
}

describe("usePredictiveCallSync", () => {
  test.each([
    ["dialing", "START_DIALING"],
    ["connected", "CONNECT"],
    ["completed", "HANG_UP"],
    ["failed", "HANG_UP"],
    ["no-answer", "HANG_UP"],
  ])("dialer status %s dispatches %s", (status, action) => {
    const send = vi.fn();
    renderHook((props: HookProps) => usePredictiveCallSync(props), {
      initialProps: baseProps({
        predictiveState: { contact_id: 7, status },
        send,
      }),
    });
    expect(send).toHaveBeenCalledWith({ type: action });
  });

  test("unknown statuses and missing contact dispatch nothing", () => {
    const send = vi.fn();
    const { rerender } = renderHook(
      (props: HookProps) => usePredictiveCallSync(props),
      {
        initialProps: baseProps({
          predictiveState: { contact_id: 7, status: "voicemail" },
          send,
        }),
      },
    );
    rerender(
      baseProps({
        predictiveState: { contact_id: null, status: "connected" },
        send,
      }),
    );
    expect(send).not.toHaveBeenCalled();
  });

  test("advances nextRecipient to the dialed contact from the queue", () => {
    const setNextRecipient = vi.fn();
    const contact = { contact_id: 7, contact: { id: 7 } } as unknown as QueueItem;
    renderHook((props: HookProps) => usePredictiveCallSync(props), {
      initialProps: baseProps({
        predictiveState: { contact_id: 7, status: "dialing" },
        queue: [contact],
        setNextRecipient,
      }),
    });
    expect(setNextRecipient).toHaveBeenCalledWith(contact);
  });
});
