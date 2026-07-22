import { describe, expect, test, vi } from "vitest";

// The pure helpers under test live in a .server module whose siblings touch
// the DB and object storage at import time in some configs — stub those out
// so this suite stays DB-free.
vi.mock("@/server/db", () => ({ db: {}, dbDirect: {} }));
vi.mock("@/server/tenant-db", () => ({ createTenantDb: vi.fn() }));
vi.mock("@/lib/object-storage.server", () => ({ uploadObject: vi.fn() }));
vi.mock("@/lib/audience-upload-db.server", () => ({
  listAudiencePhones: vi.fn(async () => new Set<string>()),
}));

import {
  chunkHouseholdPlan,
  dedupeParsedContacts,
} from "../app/lib/audience-upload-process.server";

describe("dedupeParsedContacts", () => {
  test("within-file duplicates: first occurrence wins and later rows are counted", () => {
    const rows = [
      { Phone: "(416) 555-1234", Name: "First" },
      { Phone: "4165551234", Name: "Same phone, different format" },
      { Phone: "+14165551234", Name: "Same phone, E.164" },
      { Phone: "416-555-9999", Name: "Different phone" },
    ];

    const result = dedupeParsedContacts(rows, "Phone", new Set());

    expect(result.rows).toEqual([rows[0], rows[3]]);
    expect(result.skippedDuplicateCount).toBe(2);
  });

  test("existing-audience phones are skipped and counted", () => {
    const rows = [
      { Phone: "416-555-0000" },
      { Phone: "416-555-1111" },
    ];
    const existing = new Set(["+14165550000"]);

    const result = dedupeParsedContacts(rows, "Phone", existing);

    expect(result.rows).toEqual([rows[1]]);
    expect(result.skippedDuplicateCount).toBe(1);
  });

  test("invalid phones are NOT deduped (kept for the downstream invalid-skip path)", () => {
    const rows = [
      { Phone: "123" },
      { Phone: "123" },
      { Phone: "" },
      { Phone: "" },
    ];

    const result = dedupeParsedContacts(rows, "Phone", new Set());

    expect(result.rows).toEqual(rows);
    expect(result.skippedDuplicateCount).toBe(0);
  });

  test("no phone header: rows pass through untouched", () => {
    const rows = [{ Name: "A" }, { Name: "A" }];

    const result = dedupeParsedContacts(rows, null, new Set(["+14165551234"]));

    expect(result.rows).toBe(rows);
    expect(result.skippedDuplicateCount).toBe(0);
  });

  test("a within-file duplicate of an existing phone counts once per dropped row", () => {
    const rows = [
      { Phone: "4165550000" }, // duplicate of existing
      { Phone: "4165550000" }, // duplicate again
      { Phone: "4165552222" },
    ];
    const existing = new Set(["+14165550000"]);

    const result = dedupeParsedContacts(rows, "Phone", existing);

    expect(result.rows).toEqual([rows[2]]);
    expect(result.skippedDuplicateCount).toBe(2);
  });
});

describe("chunkHouseholdPlan", () => {
  test("groups rows by normalized address|postal key; first row bearing a key populates the entry", () => {
    const chunk = [
      {
        address: "123 Main St., Apt #4",
        postal: "M5V 2T6",
        city: "Toronto",
        province: "ON",
      },
      {
        // Same household, different formatting; different city should NOT win.
        address: "123 main st apt 4",
        postal: "m5v2t6",
        city: "Somewhere Else",
        province: "QC",
      },
      {
        address: "9 Elm Road",
        postal: "K1A 0B1",
        city: undefined,
        province: undefined,
      },
    ];

    const { entries, keys } = chunkHouseholdPlan(chunk);

    expect(keys).toEqual([
      "123 main st apt 4|m5v2t6",
      "123 main st apt 4|m5v2t6",
      "9 elm road|k1a0b1",
    ]);
    expect(entries).toEqual([
      {
        household_key: "123 main st apt 4|m5v2t6",
        address: "123 Main St., Apt #4",
        postal: "M5V 2T6",
        city: "Toronto",
        province: "ON",
      },
      {
        household_key: "9 elm road|k1a0b1",
        address: "9 Elm Road",
        postal: "K1A 0B1",
        city: null,
        province: null,
      },
    ]);
  });

  test("rows without a usable address+postal get a null key and no entry", () => {
    const chunk = [
      { address: "123 Main St", postal: undefined },
      { address: undefined, postal: "M5V 2T6" },
      { address: "   ", postal: "M5V 2T6" },
      { address: undefined, postal: undefined },
    ];

    const { entries, keys } = chunkHouseholdPlan(chunk);

    expect(keys).toEqual([null, null, null, null]);
    expect(entries).toEqual([]);
  });

  test("non-string mapped values are treated as absent", () => {
    const chunk = [{ address: 42 as unknown, postal: "M5V 2T6" }];

    const { entries, keys } = chunkHouseholdPlan(chunk);

    expect(keys).toEqual([null]);
    expect(entries).toEqual([]);
  });
});
