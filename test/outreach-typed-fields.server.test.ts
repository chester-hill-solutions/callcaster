import { describe, expect, test, vi } from "vitest";

import {
  extractTypedOutreachFields,
  syncContactSupportLevelCache,
} from "@/lib/outreach-typed-fields.server";

describe("extractTypedOutreachFields", () => {
  test("returns empty object for non-object updates", () => {
    expect(extractTypedOutreachFields(undefined)).toEqual({});
    expect(extractTypedOutreachFields(null as never)).toEqual({});
    expect(extractTypedOutreachFields([])).toEqual({});
  });

  test("extracts typed columns from flat and nested IVR-style result JSON", () => {
    const fields = extractTypedOutreachFields({
      page_1: { "Support Level": "2", "Lawn Sign": "yes" },
      volunteer_interest: "maybe",
      issue_tags: ["healthcare", "housing"],
      vote_by_mail: true,
      membership_sold: "no",
      callback_audit: 1,
    });

    expect(fields).toEqual({
      support_level: 2,
      volunteer_interest: "maybe",
      lawn_sign: true,
      vote_by_mail: true,
      issue_tags: ["healthcare", "housing"],
      membership_sold: false,
      callback_audit: true,
    });
  });

  test("parses support level labels and ignores invalid values", () => {
    expect(extractTypedOutreachFields({ support: "lean opposition" })).toEqual({
      support_level: 4,
    });
    expect(extractTypedOutreachFields({ support_level: 9 })).toEqual({});
  });
});

describe("syncContactSupportLevelCache", () => {
  test("updates contact.support_level when support level is present", async () => {
    const contactUpdate = vi.fn().mockResolvedValue([{ id: 5 }]);
    const tdb = { contact: { update: contactUpdate } };

    await syncContactSupportLevelCache(tdb as never, 5, 3);

    expect(contactUpdate).toHaveBeenCalledWith({
      set: { support_level: 3 },
      where: expect.anything(),
    });
  });

  test("skips contact update when support level is absent", async () => {
    const contactUpdate = vi.fn();
    const tdb = { contact: { update: contactUpdate } };

    await syncContactSupportLevelCache(tdb as never, 5, undefined);
    await syncContactSupportLevelCache(tdb as never, 5, null);

    expect(contactUpdate).not.toHaveBeenCalled();
  });
});
