import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    getNextContact: vi.fn(),
    isRecent: vi.fn(),
    loggerError: vi.fn(),
  };
});

vi.mock("@/lib/getNextContact", () => ({ getNextContact: mocks.getNextContact }));
vi.mock("@/lib/utils", () => ({ isRecent: mocks.isRecent }));
vi.mock("@/lib/logger.client", () => ({
  logger: { error: mocks.loggerError, debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

describe("callscreenActions", () => {
  beforeEach(() => {
    mocks.getNextContact.mockReset();
    mocks.isRecent.mockReset();
    mocks.loggerError.mockReset();
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("handleConference start/end", async () => {
    const { handleConference } = await import("@/lib/callscreenActions");
    const submit = vi.fn();
    const begin = vi.fn();
    const setConference = vi.fn();

    const { handleConferenceStart, handleConferenceEnd } = handleConference({ submit, begin } as any);
    handleConferenceStart();
    expect(begin).toHaveBeenCalledTimes(1);

    handleConferenceEnd({
      activeCall: { parameters: { CallSid: "CA1" } },
      setConference,
      workspaceId: "w1",
    } as any);

    expect(submit).toHaveBeenCalledWith(
      { workspaceId: "w1" },
      expect.objectContaining({ action: "/api/auto-dial/end", method: "post" }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/hangup",
      expect.objectContaining({ method: "POST" }),
    );
    expect(setConference).toHaveBeenCalledWith();
  });

  test("handleConferenceEnd does not hang up when CallSid missing", async () => {
    const { handleConference } = await import("@/lib/callscreenActions");
    const submit = vi.fn();
    const begin = vi.fn();
    const setConference = vi.fn();

    const { handleConferenceEnd } = handleConference({ submit, begin } as any);
    handleConferenceEnd({
      activeCall: { parameters: {} },
      setConference,
      workspaceId: "w1",
    } as any);

    expect(fetch).not.toHaveBeenCalledWith("/api/hangup", expect.anything());
    expect(setConference).toHaveBeenCalledWith();
  });

  test("handleCall.startCall submits only when contact has phone", async () => {
    const { handleCall } = await import("@/lib/callscreenActions");
    const submit = vi.fn();
    const { startCall } = handleCall({ submit } as any);

    startCall({
      contact: { id: 1, phone: "+1555" },
      campaign: { id: 2, caller_id: "+1666" },
      user: { id: "u1" },
      workspaceId: "w1",
      nextRecipient: { id: 3 },
      recentAttempt: { id: 4 },
      selectedDevice: "browser",
    });
    expect(submit).toHaveBeenCalledTimes(1);

    submit.mockReset();
    startCall({
      contact: { id: 1, phone: null },
      campaign: { id: 2, caller_id: "+1666" },
      user: { id: "u1" },
      workspaceId: "w1",
    });
    expect(submit).not.toHaveBeenCalled();
  });

  test("handleContact.switchQuestionContact handles not-recent and recent attempts", async () => {
    const { handleContact } = await import("@/lib/callscreenActions");
    const setQuestionContact = vi.fn();
    const setRecentAttempt = vi.fn();
    const setUpdate = vi.fn();
    const setNextRecipient = vi.fn();

    const contact = { contact: { id: 1 } };
    const attempts = [{ id: 11, contact_id: 1, created_at: "t", result: { r: 1 } }];
    const calls = [{ outreach_attempt_id: 11, sid: "CA1" }];

    mocks.isRecent.mockReturnValueOnce(false);
    const h = handleContact({
      setQuestionContact,
      setRecentAttempt,
      setUpdate,
      setNextRecipient,
      attempts,
      calls,
    } as any);

    const returned = h.switchQuestionContact({ contact } as any);
    expect(returned).toBe(contact);
    expect(setQuestionContact).toHaveBeenCalledWith(contact);
    expect(setRecentAttempt).toHaveBeenCalledWith(null);
    expect(setUpdate).toHaveBeenCalledWith(null);

    setRecentAttempt.mockReset();
    setUpdate.mockReset();
    mocks.isRecent.mockReturnValueOnce(true);
    h.switchQuestionContact({ contact } as any);
    expect(setRecentAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ id: 11, call: calls[0] }),
    );
    expect(setUpdate).toHaveBeenCalledWith({ r: 1 });
  });

  test("switchQuestionContact sets update to null when attempt has no result", async () => {
    const { handleContact } = await import("@/lib/callscreenActions");
    const setQuestionContact = vi.fn();
    const setRecentAttempt = vi.fn();
    const setUpdate = vi.fn();
    const setNextRecipient = vi.fn();

    const contact = { contact: { id: 1 } };
    const attempts = [{ id: 11, contact_id: 1, created_at: "t" }];
    const calls = [{ outreach_attempt_id: 11, sid: "CA1" }];

    mocks.isRecent.mockReturnValueOnce(true);
    const h = handleContact({
      setQuestionContact,
      setRecentAttempt,
      setUpdate,
      setNextRecipient,
      attempts,
      calls,
    } as any);

    h.switchQuestionContact({ contact } as any);
    expect(setUpdate).toHaveBeenCalledWith(null);
  });

  test("switchQuestionContact handles missing attempt (getRecentAttempt fallback)", async () => {
    const { handleContact } = await import("@/lib/callscreenActions");
    const setQuestionContact = vi.fn();
    const setRecentAttempt = vi.fn();
    const setUpdate = vi.fn();
    const setNextRecipient = vi.fn();

    mocks.isRecent.mockReturnValueOnce(false);
    const h = handleContact({
      setQuestionContact,
      setRecentAttempt,
      setUpdate,
      setNextRecipient,
      attempts: [],
      calls: [],
    } as any);
    const contact = { contact: { id: 999 } };
    h.switchQuestionContact({ contact } as any);
    expect(setRecentAttempt).toHaveBeenCalledWith(null);
    expect(setUpdate).toHaveBeenCalledWith(null);
  });

  test("handleContact.nextNumber uses getNextContact and applies recent attempt details", async () => {
    const { handleContact } = await import("@/lib/callscreenActions");
    const setQuestionContact = vi.fn();
    const setRecentAttempt = vi.fn();
    const setUpdate = vi.fn();
    const setNextRecipient = vi.fn();

    const nextContact = { id: 2, contact: { id: 2 } };
    mocks.getNextContact.mockReturnValueOnce(null);
    const h = handleContact({
      setQuestionContact,
      setRecentAttempt,
      setUpdate,
      setNextRecipient,
      attempts: [],
      calls: [],
    } as any);
    h.nextNumber({
      skipHousehold: false,
      queue: [],
      householdMap: new Map(),
      nextRecipient: null,
      groupByHousehold: false,
    });
    expect(setNextRecipient).not.toHaveBeenCalled();

    mocks.getNextContact.mockReturnValueOnce(nextContact);
    mocks.isRecent.mockReturnValueOnce(true);
    const attempts = [{ id: 99, contact_id: 2, created_at: "t", result: { x: 1 } }];
    const calls = [{ outreach_attempt_id: 99, sid: "CA" }];
    const h2 = handleContact({
      setQuestionContact,
      setRecentAttempt,
      setUpdate,
      setNextRecipient,
      attempts,
      calls,
    } as any);
    h2.nextNumber({
      skipHousehold: false,
      queue: [],
      householdMap: new Map(),
      nextRecipient: null,
      groupByHousehold: false,
    });
    expect(setNextRecipient).toHaveBeenCalledWith(nextContact);
    expect(setUpdate).toHaveBeenCalledWith({});
    expect(setRecentAttempt).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 99, call: calls[0] }),
    );
  });

  test("handleQueue.dequeue submits and filters queue", async () => {
    const { handleQueue } = await import("@/lib/callscreenActions");
    const submit = vi.fn();
    const setQueue = vi.fn();
    const { dequeue } = handleQueue({
      submit,
      groupByHousehold: true,
      campaign: { id: 1 },
      workspaceId: "w1",
      setQueue,
    } as any);

    dequeue({ contact: { contact: { id: 1, phone: "+1555" } } } as any);
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ contact_id: 1, household: true }),
      expect.objectContaining({ action: "/api/queues" }),
    );
    expect(typeof setQueue.mock.calls[0][0]).toBe("function");
    const updater = setQueue.mock.calls[0][0];
    expect(
      updater([
        { contact: { id: 1 } },
        { contact: { id: 2 } },
      ]),
    ).toEqual([{ contact: { id: 2 } }]);
  });

  test("handleQueue.dequeue returns early when contact phone is missing", async () => {
    const { handleQueue } = await import("@/lib/callscreenActions");
    const submit = vi.fn();
    const setQueue = vi.fn();
    const { dequeue } = handleQueue({
      submit,
      groupByHousehold: false,
      campaign: { id: 1 },
      workspaceId: "w1",
      setQueue,
    } as any);

    dequeue({ contact: { contact: { id: 1, phone: null } } } as any);
    expect(submit).not.toHaveBeenCalled();
    expect(setQueue).not.toHaveBeenCalled();
  });

  test("handleQueue.fetchMore updates queue and logs on failure", async () => {
    const { handleQueue } = await import("@/lib/callscreenActions");
    const submit = vi.fn();

    let queue: any[] = [{ id: 1, queue_id: 1, contact: { id: 1, address: "A" } }];
    const setQueue = (updater: any) => {
      queue = updater(queue);
    };

    (fetch as any).mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { id: 2, queue_id: 2, contact: { id: 2, address: "A" } }, // same household, new id -> add
          { id: 2, queue_id: 2, contact: { id: 2, address: "A" } }, // duplicate -> ignore
          { id: 3, queue_id: 3, contact: { id: 3, address: null } }, // fallback address
        ]),
        { status: 200 },
      ),
    );

    const { fetchMore } = handleQueue({
      submit,
      groupByHousehold: true,
      campaign: { id: 9 },
      workspaceId: "w1",
      setQueue,
    } as any);

    await fetchMore({ householdMap: { A: [] } });
    expect(queue.map((q) => q.queue_id).sort()).toEqual([1, 2, 3]);

    (fetch as any).mockRejectedValueOnce(new Error("nope"));
    await fetchMore({ householdMap: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`K${i}`, []])) });
    expect(mocks.loggerError).toHaveBeenCalled();
  });
});

