import { useState } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useCampaignQueueFlow } from "@/hooks/call/useCampaignQueueFlow";
import { useCampaignDequeueActions } from "@/hooks/call/useCampaignDialActions";
import { recoveredContact } from "../helpers/predictive-recovery-fixture";
import type { Campaign, QueueItem } from "@/lib/types";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
const campaign = { id: 42, dial_type: "call", group_household_queue: false } as Campaign;
const contact: QueueItem = { ...recoveredContact, queue_state: "queued", dequeued_at: null, voice_reservation_id: null };
const other: QueueItem = { ...contact, id: 28, contact_id: 8, contact: { ...contact.contact, id: 8 } };
const actor = "10000000-0000-4000-8000-000000000002";
const fetcher = vi.fn<typeof fetch>();
let resolve: (value: Response) => void;
const ack = { workspace_id: contact.workspace, campaign_id: 42, contact_id: 7, queue_id: 27,
  dispatch_generation: contact.dispatch_generation, voice_reservation_id: null, removed_entries: [{ queue_id: 27, contact_id: 7, dispatch_generation: contact.dispatch_generation, voice_reservation_id: null }], household: false, user_id: actor, success: true, dequeued: true, advance_state: "dequeued" };

beforeEach(() => {
  fetcher.mockReset();
  fetcher.mockImplementation(() => new Promise<Response>(done => { resolve = done; }));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { vi.unstubAllGlobals(); });

function screenFlow(callSid: string | null = null, initialSubject = contact, household = false) {
  return renderHook(({ workspaceId, userId, subject }) => {
    const [queue, setQueue] = useState([initialSubject, other]);
    const [answers, setAnswers] = useState<Record<string, unknown> | null>({ q1: "retained answer" });
    const [selected, setSelected] = useState<QueueItem | null>(subject);
    const [saveData] = useState(() => vi.fn());
    const flow = useCampaignQueueFlow({ campaign, workspaceId, userId, questionContact: subject, customerCallSid: callSid,
      isCurrentCustomer: () => true, groupByHousehold: household, queue, householdMap: {}, nextRecipient: subject,
      attemptList: [], callsList: [], activeCallSid: undefined, hangUp: vi.fn(), setQuestionContact: setSelected,
      setRecentAttempt: vi.fn(), setUpdate: vi.fn(), setNextRecipient: setSelected, setQueue });
    const next = useCampaignDequeueActions({ campaign, questionContact: subject, send: vi.fn(), setCallDuration: vi.fn(),
      handleDialButton: vi.fn(), saveData, dequeue: flow.dequeue, isCurrentQueue: flow.isCurrentQueue,
      fetchMore: vi.fn(async () => undefined), householdMap: {}, handleNextNumber: flow.handleNextNumber, setRecentAttempt: vi.fn(), setUpdate: setAnswers });
    return { ...flow, queue, setQueue, next, answers, selected, saveData };
  }, { initialProps: { workspaceId: contact.workspace, userId: actor, subject: initialSubject } });
}

describe("call-screen confirmed queue advance", () => {
  test("keeps the current row while pending and removes it only after exact confirmation", async () => {
    const { result } = screenFlow(); let pending!: Promise<boolean>;
    act(() => { pending = result.current.dequeue({ contact }); });
    expect(result.current.pending).toBe(true); expect(result.current.queue).toEqual([contact, other]);
    await act(async () => { resolve(Response.json(ack)); expect(await pending).toBe(true); });
    expect(result.current.queue).toEqual([other]); expect(result.current.pending).toBe(false);
  });
  test.each([409, 500])("HTTP %s keeps the row and permits the same action to retry", async status => {
    const { result } = screenFlow(); let pending!: Promise<boolean>;
    act(() => { pending = result.current.dequeue({ contact }); });
    await act(async () => { resolve(Response.json({ error: "Owned queue refusal" }, { status })); expect(await pending).toBe(false); });
    expect(result.current.queue).toEqual([contact, other]); expect(result.current.pending).toBe(false);
    act(() => { pending = result.current.dequeue({ contact }); });
    await act(async () => { resolve(Response.json(ack)); expect(await pending).toBe(true); });
    expect(result.current.queue).toEqual([other]);
  });
  test("a second click cannot send another pending advance", async () => {
    const { result } = screenFlow(); let first!: Promise<boolean>;
    act(() => { first = result.current.dequeue({ contact }); });
    await act(async () => { expect(await result.current.dequeue({ contact })).toBe(false); });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(Response.json(ack)); expect(await first).toBe(true); });
  });
  test.each(["workspace", "actor", "contact"])("an old %s reply cannot remove a row from the current view", async changed => {
    const { result, rerender } = screenFlow(); let pending!: Promise<boolean>;
    act(() => { pending = result.current.dequeue({ contact }); });
    rerender({ workspaceId: changed === "workspace" ? "other-workspace" : contact.workspace,
      userId: changed === "actor" ? "other-agent" : actor, subject: changed === "contact" ? other : contact });
    await act(async () => { resolve(Response.json(ack)); expect(await pending).toBe(false); });
    expect(result.current.queue).toEqual([contact, other]); expect(result.current.pending).toBe(false);
  });
  test("a newer generation delivered while the reply is pending remains queued", async () => {
    const { result } = screenFlow(); let pending!: Promise<boolean>;
    act(() => { pending = result.current.dequeue({ contact }); });
    const newer = { ...contact, dispatch_generation: "20000000-0000-4000-8000-000000000099" };
    act(() => result.current.setQueue([newer, other]));
    await act(async () => { resolve(Response.json(ack)); expect(await pending).toBe(true); });
    expect(result.current.queue).toEqual([newer, other]);
  });
  test("a newer reservation in the same generation survives an older acknowledgement", async () => {
    const { result } = screenFlow(); let pending!: Promise<boolean>;
    act(() => { pending = result.current.dequeue({ contact }); });
    const newer = { ...contact, voice_reservation_id: "20000000-0000-4000-8000-000000000077" };
    act(() => result.current.setQueue([newer, other]));
    await act(async () => { resolve(Response.json(ack)); expect(await pending).toBe(true); });
    expect(result.current.queue).toEqual([newer, other]);
  });
  test("a household request captures hidden members and removes only the confirmed identities", async () => {
    const member = { queue_id: other.id, contact_id: other.contact_id, dispatch_generation: other.dispatch_generation, voice_reservation_id: null };
    const hidden = { ...member, queue_id: 29, contact_id: 9 };
    const subject = { ...contact, advance_snapshot: { household_id: "10000000-0000-4000-8000-000000000088", entries: [member, hidden] } };
    const { result } = screenFlow(null, subject, true); let pending!: Promise<boolean>;
    act(() => { pending = result.current.dequeue({ contact: subject }); });
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).household_snapshot.entries).toEqual([member, hidden]);
    const newer = { ...other, dispatch_generation: "20000000-0000-4000-8000-000000000099" };
    act(() => result.current.setQueue([subject, newer]));
    await act(async () => { resolve(Response.json({ ...ack, household: true, household_snapshot: subject.advance_snapshot,
      removed_entries: [...ack.removed_entries, member, hidden] })); expect(await pending).toBe(true); });
    expect(result.current.queue).toEqual([newer]);
  });
  test("Save and Next uses the current queue after its primary row leaves through realtime", async () => {
    const { result } = screenFlow(); let pending!: Promise<void>;
    act(() => { pending = result.current.next(); });
    act(() => result.current.setQueue([other]));
    await act(async () => { resolve(Response.json(ack)); await pending; });
    expect(result.current.selected?.id).toBe(other.id);
    expect(result.current.queue).toEqual([other]);
  });
  test("a requested batch still arrives after advancing to another contact on the same page", async () => {
    const { result, rerender } = screenFlow(); let pending!: Promise<void>;
    act(() => { pending = result.current.fetchMore({ householdMap: {} }); });
    rerender({ workspaceId: contact.workspace, userId: actor, subject: other });
    const extra = { ...other, id: 29, contact_id: 9, contact: { ...other.contact, id: 9 } };
    await act(async () => { resolve(Response.json([extra])); await pending; });
    expect(result.current.queue.map(row => row.id)).toEqual([27, 28, 29]);
  });
  test("a batch from an old page cannot enter the current queue", async () => {
    const { result, rerender } = screenFlow(); let pending!: Promise<void>;
    act(() => { pending = result.current.fetchMore({ householdMap: {} }); });
    rerender({ workspaceId: "other-workspace", userId: actor, subject: other });
    await act(async () => { resolve(Response.json([{ ...other, id: 29 }])); await pending; });
    expect(result.current.queue).toEqual([contact, other]);
  });
  test.each([200, 409, 500])("Save and Next retains answers until a matching HTTP 200, received %s", async status => {
    const { result } = screenFlow(); let pending!: Promise<void>;
    act(() => { pending = result.current.next(); });
    expect(result.current.answers).toEqual({ q1: "retained answer" });
    expect(result.current.queue).toEqual([contact, other]);
    await act(async () => { resolve(Response.json(status === 200 ? ack : { error: "Owned queue refusal" }, { status })); await pending; });
    expect(result.current.answers).toEqual(status === 200 ? {} : { q1: "retained answer" });
    expect(result.current.queue).toEqual(status === 200 ? [other] : [contact, other]);
  });
  test("an old Save and Next reply cannot clear answers after the contact changes", async () => {
    const { result, rerender } = screenFlow(); let pending!: Promise<void>;
    act(() => { pending = result.current.next(); });
    rerender({ workspaceId: contact.workspace, userId: actor, subject: other });
    await act(async () => { resolve(Response.json(ack)); await pending; });
    expect(result.current.answers).toEqual({ q1: "retained answer" });
    expect(result.current.queue).toEqual([contact, other]);
  });
  test("a retained callback cannot start another command after unmount", async () => {
    const { result, unmount } = screenFlow(); const dequeue = result.current.dequeue;
    unmount();
    expect(await dequeue({ contact })).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
  test("a retained Save and Next callback cannot save after unmount", async () => {
    const { result, unmount } = screenFlow(); const { next, saveData } = result.current;
    unmount(); await next();
    expect(saveData).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  test("Save and Next selects from the current queue after a pending reply", async () => {
    const { result } = screenFlow();
    const third = { ...other, id: 29, contact_id: 9, contact: { ...other.contact, id: 9 } };
    act(() => result.current.setQueue([contact, other, third]));
    let pending!: Promise<void>;
    act(() => { pending = result.current.next(); });
    act(() => result.current.setQueue([contact, third]));
    await act(async () => { resolve(Response.json(ack)); await pending; });
    expect(result.current.selected?.id).toBe(third.id);
    expect(result.current.queue).toEqual([third]);
  });
  test("an acknowledged old completed call can finish its form while the newer queue work stays", async () => {
    const callSid = "CA33333333333333333333333333333333";
    const { result } = screenFlow(callSid); let pending!: Promise<void>;
    act(() => { pending = result.current.next(); });
    await act(async () => {
      resolve(Response.json({ ...ack, call_sid: callSid, dequeued: false, advance_state: "superseded", removed_entries: [] })); await pending;
    });
    expect(result.current.answers).toEqual({});
    expect(result.current.queue).toEqual([contact, other]);
  });
});
