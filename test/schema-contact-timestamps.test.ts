import { describe, expect, test } from "vitest";

import { contact } from "@/db/schema";

/**
 * `contact` declared four temporal columns `text()` while the database has
 * `timestamp with time zone` (#2213).
 *
 * The mode stays `"string"`, which keeps both writers working unchanged:
 * `contact-editor.server.ts` and `audience-import-map.server.ts` already pass
 * `new Date().toISOString()`. The one behaviour that does change is ordering:
 * `audience-detail.server.ts` sorts by a caller-chosen column, and `created_at`
 * now sorts as a timestamp rather than as text.
 */
describe("contact timestamps (#2213)", () => {
  test.each([
    ["created_at", contact.created_at],
    ["date_updated", contact.date_updated],
    ["voter_list_expires_at", contact.voter_list_expires_at],
    ["voter_list_imported_at", contact.voter_list_imported_at],
  ])("%s is timestamp with time zone", (_name, column) => {
    expect(column.getSQLType()).toBe("timestamp with time zone");
  });

  test("only created_at carries the database default", () => {
    expect(contact.created_at.hasDefault).toBe(true);
    expect(contact.date_updated.hasDefault).toBe(false);
    expect(contact.voter_list_expires_at.hasDefault).toBe(false);
    expect(contact.voter_list_imported_at.hasDefault).toBe(false);
  });
});
