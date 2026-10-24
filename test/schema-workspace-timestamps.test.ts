import { describe, expect, test } from "vitest";

import {
  workspace,
  workspace_api_key,
  workspace_audit_event,
  workspace_events,
  workspace_invite,
  workspace_number,
  workspace_users,
} from "@/db/schema";

/**
 * The workspace-family tables declared nine temporal columns `text()` while the
 * database has `timestamp with time zone` (#2213).
 *
 * Mode `"string"` keeps every reader and writer unchanged: the picker orders by
 * `workspace_member.created_at`, `workspace_users.last_accessed` is displayed,
 * `workspace_api_key.last_used_at` is stamped with an ISO string, and the audit
 * and event rows are written with the database's own `now()`.
 */
describe("workspace-family timestamps (#2213)", () => {
  test.each([
    ["workspace.created_at", workspace.created_at],
    ["workspace_users.created_at", workspace_users.created_at],
    ["workspace_users.last_accessed", workspace_users.last_accessed],
    ["workspace_api_key.created_at", workspace_api_key.created_at],
    ["workspace_api_key.last_used_at", workspace_api_key.last_used_at],
    ["workspace_invite.created_at", workspace_invite.created_at],
    ["workspace_audit_event.created_at", workspace_audit_event.created_at],
    ["workspace_events.created_at", workspace_events.created_at],
    ["workspace_number.created_at", workspace_number.created_at],
  ])("%s is timestamp with time zone", (_name, column) => {
    expect(column.getSQLType()).toBe("timestamp with time zone");
  });

  test("created/audit rows keep the database default; usage stamps do not", () => {
    expect(workspace.created_at.hasDefault).toBe(true);
    expect(workspace_audit_event.created_at.hasDefault).toBe(true);
    expect(workspace_events.created_at.hasDefault).toBe(true);
    // "Last used" and "last accessed" are written by the app when the thing
    // happens, so the database must not invent a value for them.
    expect(workspace_api_key.last_used_at.hasDefault).toBe(false);
  });
});
