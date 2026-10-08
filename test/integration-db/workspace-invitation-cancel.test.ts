import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { sql } from "drizzle-orm";
import { asRouteResponse } from "../helpers/route-result";
import {
  withDataPlaneRouteArgs,
  withWorkspaceRouteArgs,
} from "../helpers/route-context-mock";

const mocks = vi.hoisted(() => ({ role: vi.fn(), access: vi.fn() }));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/workspace.server")>()),
  getUserRole: (...args: unknown[]) => mocks.role(...args),
  requireWorkspaceAccess: (...args: unknown[]) => mocks.access(...args),
}));
const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const workspace = "11111111-2222-4333-8444-777777777777";
const otherWorkspace = "aaaaaaaa-bbbb-4ccc-8ddd-ffffffffffff";
const user = "11111111-2222-4333-8444-555555555555";
const missing = "wi_cancel_missing";
const foreign = "wi_cancel_foreign";
const owned = "wi_cancel_owned";
const accepted = "wi_cancel_accepted";
const cancelled = "wi_cancel_cancelled";

suite(
  "invitation cancellation uses the selected workspace in Postgres (#2076)",
  () => {
    beforeEach(() => {
      vi.resetAllMocks();
      mocks.role.mockResolvedValue({ role: "member" });
      mocks.access.mockResolvedValue(undefined);
    });
    afterAll(async () => {
      const { pool, directPool } = await import("@/server/db");
      await Promise.all([pool.end(), directPool.end()]);
    });

    async function withInvites(run: () => Promise<void>) {
      const { db } = await import("@/server/db");
      await db.execute(sql`insert into public.workspace_invitation
      (id, workspace_id, email, role_id, invited_by_user_id, token_hash, status, expires_at) values
      (${owned}, ${workspace}, 'owned@example.com', 'member', ${user}, 'old-owned-hash', 'pending', now() + interval '1 day'),
      (${foreign}, ${otherWorkspace}, 'foreign@example.com', 'member', ${user}, 'old-foreign-hash', 'pending', now() + interval '1 day'),
      (${accepted}, ${workspace}, 'accepted@example.com', 'member', ${user}, 'accepted-hash', 'accepted', now() + interval '1 day'),
      (${cancelled}, ${workspace}, 'cancelled@example.com', 'member', ${user}, 'cancelled-hash', 'canceled', now() + interval '1 day')`);
      try {
        await run();
      } finally {
        await db.execute(
          sql`delete from public.workspace_invitation where id in (${owned}, ${foreign}, ${accepted}, ${cancelled})`,
        );
      }
    }
    async function rows() {
      const { db } = await import("@/server/db");
      return db.execute(sql`select id, status, token_hash, expires_at from public.workspace_invitation
      where id in (${owned}, ${foreign}, ${accepted}, ${cancelled}) order by id`);
    }
    async function api(invitationId: string) {
      const { action } =
        await import("../../app/routes/api+/workspaces+/$workspaceId/members.route");
      return asRouteResponse(
        action(
          await withDataPlaneRouteArgs(
            {
              params: { workspaceId: workspace },
              request: new Request(
                `https://base.example/api/workspaces/${workspace}/members`,
                {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    target: "invite",
                    invite_id: invitationId,
                  }),
                },
              ),
            },
            { userId: user, workspaceId: workspace },
          ),
        ),
      );
    }
    async function product(invitationId: string, role = "member") {
      const { action } =
        await import("../../app/routes/workspaces+/$id/settings.action.server");
      return asRouteResponse(
        action(
          await withWorkspaceRouteArgs(
            {
              params: { id: workspace },
              request: new Request(
                `https://base.example/workspaces/${workspace}/settings`,
                {
                  method: "POST",
                  body: new URLSearchParams({
                    formName: "cancelInvite",
                    userId: invitationId,
                  }),
                },
              ),
            },
            { userId: user, workspaceId: workspace, userRole: role },
          ),
        ),
      );
    }
    test.each([foreign, missing, accepted, cancelled])(
      "canonical writer refuses %s without changes",
      async (id) => {
        const { cancelWorkspaceInvitationById } =
          await import("@/lib/workspace-invitations.server");
        await withInvites(async () => {
          const before = await rows();
          await expect(
            cancelWorkspaceInvitationById(id, workspace),
          ).rejects.toMatchObject({
            status: 404,
            message: "Invitation not found.",
          });
          expect(await rows()).toEqual(before);
        });
      },
    );
    test("API and settings refuse foreign, missing and non-pending invitations with the same 404", async () => {
      await withInvites(async () => {
        const before = await rows();
        for (const id of [foreign, missing, accepted, cancelled]) {
          for (const response of [await api(id), await product(id)]) {
            expect(response.status).toBe(404);
            expect(await response.json()).toMatchObject({
              error: "Invitation not found.",
            });
          }
        }
        expect(await rows()).toEqual(before);
      });
    });
    test.each(["member", "admin", "owner"])(
      "%s still cancels a selected-workspace invite through API and settings",
      async (role) => {
        mocks.role.mockResolvedValue({ role });
        for (const cancel of [
          (id: string) => api(id),
          (id: string) => product(id, role),
        ]) {
          await withInvites(async () => {
            expect((await cancel(owned)).status).toBe(200);
            const result = await rows();
            expect(result.find((x) => x.id === owned)?.status).toBe("canceled");
            expect(result.find((x) => x.id === foreign)?.status).toBe(
              "pending",
            );
          });
        }
      },
    );
    test("caller and non-member refusal still leave invitations unchanged", async () => {
      await withInvites(async () => {
        const before = await rows();
        mocks.role.mockResolvedValue({ role: "caller" });
        expect((await api(owned)).status).toBe(403);
        expect((await product(owned, "caller")).status).toBe(403);
        mocks.role.mockResolvedValue(null);
        expect((await api(owned)).status).toBe(404);
        mocks.access.mockRejectedValue(
          Response.json({ error: "Workspace not found" }, { status: 404 }),
        );
        expect((await product(owned)).status).toBe(404);
        expect(await rows()).toEqual(before);
      });
    });
    test("the global admin helper retains intentional cross-workspace cancellation", async () => {
      const { deleteWorkspaceInviteById } =
        await import("@/lib/workspace-members-db.server");
      await withInvites(async () => {
        await deleteWorkspaceInviteById(foreign);
        const result = await rows();
        expect(result.find((x) => x.id === foreign)?.status).toBe("canceled");
        expect(result.find((x) => x.id === owned)?.status).toBe("pending");
      });
    });
  },
);
