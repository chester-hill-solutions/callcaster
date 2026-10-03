import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { workspace_invitation } from "@/db/schema";

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const workspace = "11111111-2222-4333-8444-777777777777";
const otherWorkspace = "aaaaaaaa-bbbb-4ccc-8ddd-ffffffffffff";
const owned = "wi_resend_owned";
const foreign = "wi_resend_foreign";
const accepted = "wi_resend_accepted";
const cancelled = "wi_resend_cancelled";
const invitee = "invitee@example.com";

suite(
  "invitation resend filters identity and workspace in Postgres (#2077)",
  () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-03T12:00:00.000Z"));
    });
    afterEach(() => vi.useRealTimers());
    afterAll(async () => {
      const { pool, directPool } = await import("@/server/db");
      await Promise.all([pool.end(), directPool.end()]);
    });
    async function withInvites(run: () => Promise<void>) {
      const { db } = await import("@/server/db");
      const common = {
        email: invitee,
        role_id: "member",
        invited_by_user_id: "user-owner",
        token_hash: "original-token-hash",
        expires_at: new Date("2026-10-02T12:00:00.000Z"),
      };
      await db.insert(workspace_invitation).values([
        { ...common, id: owned, workspace_id: workspace, status: "pending" },
        {
          ...common,
          id: foreign,
          workspace_id: otherWorkspace,
          status: "pending",
        },
        {
          ...common,
          id: accepted,
          workspace_id: workspace,
          status: "accepted",
        },
        {
          ...common,
          id: cancelled,
          workspace_id: workspace,
          status: "canceled",
        },
      ]);
      try {
        await run();
      } finally {
        await db
          .delete(workspace_invitation)
          .where(
            inArray(workspace_invitation.id, [
              owned,
              foreign,
              accepted,
              cancelled,
            ]),
          );
      }
    }
    async function rows() {
      const { db } = await import("@/server/db");
      return db
        .select()
        .from(workspace_invitation)
        .where(
          inArray(workspace_invitation.id, [
            owned,
            foreign,
            accepted,
            cancelled,
          ]),
        )
        .orderBy(workspace_invitation.id);
    }
    test.each([
      {
        name: "foreign workspace",
        id: foreign,
        workspaceId: workspace,
        email: invitee,
      },
      {
        name: "foreign email",
        id: owned,
        workspaceId: workspace,
        email: "other@example.com",
      },
      {
        name: "missing",
        id: "wi_resend_missing",
        workspaceId: workspace,
        email: invitee,
      },
      {
        name: "accepted",
        id: accepted,
        workspaceId: workspace,
        email: invitee,
      },
      {
        name: "cancelled",
        id: cancelled,
        workspaceId: workspace,
        email: invitee,
      },
    ])(
      "$name refusal leaves every token, expiry and status unchanged",
      async ({ id, workspaceId, email }) => {
        const { resendWorkspaceInvitation } =
          await import("@/lib/workspace-invitations.server");
        await withInvites(async () => {
          const before = await rows();
          await expect(
            resendWorkspaceInvitation(id, workspaceId, email),
          ).rejects.toMatchObject({
            status: 404,
            message: "Invitation not found.",
          });
          expect(await rows()).toEqual(before);
        });
      },
    );
    test("an authorized expired pending invite receives a new hash and seven-day expiry only in the selected row", async () => {
      const { resendWorkspaceInvitation } =
        await import("@/lib/workspace-invitations.server");
      const { db } = await import("@/server/db");
      await withInvites(async () => {
        const before = await rows();
        const result = await resendWorkspaceInvitation(
          owned,
          workspace,
          "  INVITEE@example.com  ",
        );
        expect(result.invitation).toMatchObject({
          id: owned,
          workspaceId: workspace,
          email: invitee,
          roleId: "member",
        });
        const [row] = await db
          .select()
          .from(workspace_invitation)
          .where(eq(workspace_invitation.id, owned));
        expect(row).toBeDefined();
        if (!row) throw new Error("Authorized invitation vanished");
        expect(row.token_hash).not.toBe("original-token-hash");
        expect(row.token_hash).not.toBe(result.rawToken);
        expect(row.token_hash).toBe(
          createHash("sha256").update(result.rawToken).digest("hex"),
        );
        expect(row.expires_at.toISOString()).toBe("2026-10-10T12:00:00.000Z");
        expect(row.status).toBe("pending");
        expect((await rows()).filter((x) => x.id !== owned)).toEqual(
          before.filter((x) => x.id !== owned),
        );
      });
    });
  },
);
