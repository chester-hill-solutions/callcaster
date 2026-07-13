import { describe, expect, test } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { user, workspace, workspace_member } from "@/db/schema";
import { eqChsTextToUuid } from "@/lib/chs-uuid-text.server";

describe("eqChsTextToUuid", () => {
  test("emits uuid::text casts for CHS membership joins", () => {
    const client = postgres("postgresql://unused@127.0.0.1:1/unused", {
      lazy: true,
      max: 1,
    });
    const db = drizzle(client);

    const workspaceSql = db
      .select({ id: workspace.id })
      .from(workspace_member)
      .innerJoin(
        workspace,
        eqChsTextToUuid(workspace_member.workspace_id, workspace.id),
      )
      .toSQL().sql;
    const userSql = db
      .select({ id: user.id })
      .from(workspace_member)
      .innerJoin(user, eqChsTextToUuid(workspace_member.user_id, user.id))
      .toSQL().sql;

    expect(workspaceSql).toContain(`("workspace"."id")::text`);
    expect(userSql).toContain(`("user"."id")::text`);

    void client.end({ timeout: 0 });
  });
});
