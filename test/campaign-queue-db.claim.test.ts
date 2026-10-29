import { beforeEach, describe, expect, test, vi } from "vitest";

const globalDb = vi.hoisted(() => ({ select: vi.fn(), update: vi.fn() }));
const scoped = vi.hoisted(() => ({ find: vi.fn(), update: vi.fn(), emit: vi.fn() }));
vi.mock("@/server/db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/db")>(), db: globalDb,
}));
vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/workspace-events.server")>(), emitQueueEvent: scoped.emit,
}));

const generation = "00000000-0000-4000-8000-000000000001";
const queue = (id: number) => ({ id, workspace: "w1", dispatch_generation: generation, assigned_to_user_id: "user-1" });
const claim = (contactId: number, queueId: number) => ({ contact_id: contactId, queue_id: queueId,
  caller_id: "+15550001111", contact_phone: "+15550002222" });
function makeTdb(execute: ReturnType<typeof vi.fn>) {
  return { execute, campaign_queue: { findFirst: scoped.find, update: scoped.update }, contact: { findFirst: scoped.find } } as any;
}

describe("claimNextQueueContact opt-out guard", () => {
  beforeEach(() => {
    vi.clearAllMocks(); scoped.find.mockReset();
    scoped.update.mockReset().mockResolvedValue([queue(11)]);
    globalDb.select.mockImplementation(() => { throw new Error("Claim reads must use the supplied transaction"); });
    globalDb.update.mockImplementation(() => { throw new Error("Claim writes must use the supplied transaction"); });
  });
  test("returns the claimed row when the contact is not opted out", async () => {
    const { claimNextQueueContact } = await import("@/lib/campaign-queue-db.server");
    const execute = vi.fn().mockResolvedValueOnce([claim(5, 11)]);
    scoped.find.mockResolvedValueOnce(queue(11)).mockResolvedValueOnce({ opt_out: false });
    expect(await claimNextQueueContact(makeTdb(execute), 1, "user-1")).toEqual(claim(5, 11));
    expect(execute).toHaveBeenCalledOnce(); expect(scoped.update).not.toHaveBeenCalled();
    expect(globalDb.select).not.toHaveBeenCalled();
  });
  test("returns null when no row is claimed", async () => {
    const { claimNextQueueContact } = await import("@/lib/campaign-queue-db.server");
    const execute = vi.fn().mockResolvedValueOnce([]);
    expect(await claimNextQueueContact(makeTdb(execute), 1, "user-1")).toBeNull();
    expect(execute).toHaveBeenCalledOnce(); expect(scoped.find).not.toHaveBeenCalled();
  });
  test("dequeues an opted-out claim and returns the next eligible contact", async () => {
    const { claimNextQueueContact } = await import("@/lib/campaign-queue-db.server");
    const execute = vi.fn().mockResolvedValueOnce([claim(5, 11)]).mockResolvedValueOnce([claim(6, 12)]);
    scoped.find.mockResolvedValueOnce(queue(11)).mockResolvedValueOnce({ opt_out: true })
      .mockResolvedValueOnce(queue(12)).mockResolvedValueOnce({ opt_out: false });
    expect(await claimNextQueueContact(makeTdb(execute), 1, "user-1")).toEqual(claim(6, 12));
    expect(execute).toHaveBeenCalledTimes(2); expect(scoped.update).toHaveBeenCalledOnce();
    expect(scoped.update).toHaveBeenCalledWith(expect.objectContaining({ set: expect.objectContaining({
      queue_state: "dequeued", dequeued_by: "user-1", dequeued_reason: "Contact opted out",
    }) }));
    expect(globalDb.update).not.toHaveBeenCalled();
  });
  test("gives up after ten opted-out claims", async () => {
    const { claimNextQueueContact } = await import("@/lib/campaign-queue-db.server");
    const execute = vi.fn().mockResolvedValue([claim(5, 11)]);
    let reads = 0; scoped.find.mockImplementation(async () => reads++ % 2 === 0 ? queue(11) : { opt_out: true });
    expect(await claimNextQueueContact(makeTdb(execute), 1, "user-1")).toBeNull();
    expect(execute).toHaveBeenCalledTimes(10); expect(scoped.update).toHaveBeenCalledTimes(10);
  });
});
