import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse, routeArgs } from "./helpers/route-result";
import { withAdminRouteArgs } from "./helpers/route-context-mock";

/**
 * Requeue is the recovery path for a dead-lettered debit: the ops alert says a
 * charge was lost, and this is what puts it back. These cover the parts that
 * would make it lose money silently — a bad id treated as success, or a
 * concurrent requeue reported as a second successful one.
 */
const mocks = vi.hoisted(() => ({
  requeueDeadLetteredJob: vi.fn(),
}));

vi.mock("@/lib/admin-jobs.server", () => ({
  requeueDeadLetteredJob: (...args: unknown[]) => mocks.requeueDeadLetteredJob(...args),
}));

import { action } from "@/routes/admin+/dead-letters.action.server";

function postJobId(value: string) {
  const body = new FormData();
  body.append("jobId", value);
  return new Request("https://app.test/admin/dead-letters", { method: "POST", body });
}

async function runAction(request: Request) {
  const args = await withAdminRouteArgs(routeArgs(request), { userId: "admin-1" });
  return asRouteResponse(await (action as any)(args));
}

describe("admin dead-letter requeue action", () => {
  beforeEach(() => {
    mocks.requeueDeadLetteredJob.mockReset();
  });

  test("requeues the job and reports which one", async () => {
    mocks.requeueDeadLetteredJob.mockResolvedValue({
      ok: true,
      jobId: 42,
      type: "sms_status_side_effects",
    });

    const response = await runAction(postJobId("42"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ requeuedJobId: 42 });
    // The actor is recorded, so a requeue is attributable.
    expect(mocks.requeueDeadLetteredJob).toHaveBeenCalledWith(42, "admin-1");
  });

  test("a job that is no longer dead-lettered is a conflict, not a success", async () => {
    mocks.requeueDeadLetteredJob.mockResolvedValue({ ok: false, reason: "not_found" });

    const response = await runAction(postJobId("42"));

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/not currently dead-lettered/);
  });

  test.each(["", "abc", "0", "-3", "1.5"])(
    "rejects %o without touching the database",
    async (value) => {
      const response = await runAction(postJobId(value));

      expect(response.status).toBe(400);
      expect(mocks.requeueDeadLetteredJob).not.toHaveBeenCalled();
    },
  );
});
