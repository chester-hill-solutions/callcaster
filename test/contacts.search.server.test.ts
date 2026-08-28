import { describe, expect, test } from "vitest";

import { escapeIlikeTerm } from "@/lib/contacts/search.server";

describe("contacts.search.server", () => {
  test("escapeIlikeTerm escapes wildcards and commas", () => {
    expect(escapeIlikeTerm("  foo%bar_baz,qux  ")).toBe("foo\\%bar\\_baz qux");
  });
});
