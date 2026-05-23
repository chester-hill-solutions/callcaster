import { describe, expect, test } from "vitest";

import {
  buildContactSearchFilter,
  escapeIlikeTerm,
} from "@/lib/contacts/search.server";

describe("contacts.search.server", () => {
  test("escapeIlikeTerm escapes wildcards and commas", () => {
    expect(escapeIlikeTerm("  foo%bar_baz,qux  ")).toBe("foo\\%bar\\_baz qux");
  });

  test("buildContactSearchFilter returns empty string for blank input", () => {
    expect(buildContactSearchFilter("   ")).toBe("");
  });

  test("buildContactSearchFilter uses prefix match for short text queries", () => {
    const filter = buildContactSearchFilter("jo");
    expect(filter).toContain("firstname.ilike.jo%");
    expect(filter).toContain("phone.ilike.jo%");
    expect(filter).not.toContain("phone.eq.");
  });

  test("buildContactSearchFilter uses substring match for longer text queries", () => {
    const filter = buildContactSearchFilter("john");
    expect(filter).toContain("firstname.ilike.%john%");
    expect(filter).toContain("phone.ilike.%john%");
  });

  test("buildContactSearchFilter adds phone-specific filters for digit queries", () => {
    const filter = buildContactSearchFilter("(555) 123-4567");
    expect(filter).toContain("phone.eq.5551234567");
    expect(filter).toContain("phone.ilike.5551234567%");
    expect(filter).toContain("phone.ilike.%5551234567%");
  });
});
