import { describe, expect, test } from "vitest";
import {
  buildContactsFromRecords,
  parseCsvRecords,
} from "../supabase/functions/_shared/audience-upload.ts";

describe("audience upload CSV parsing + mapping", () => {
  test("parses quoted fields containing commas and embedded newlines", () => {
    const csv = `Name,EMAIL,Custom\r\n"Doe, Jane",jane@example.com,"hello,\nworld"\r\n`;
    const records = parseCsvRecords(csv);
    expect(records).toEqual([
      {
        Name: "Doe, Jane",
        EMAIL: "jane@example.com",
        Custom: "hello,\nworld",
      },
    ]);
  });

  test("pads missing columns when row is short", () => {
    const csv = `a,b,c\n1,2\n`;
    const records = parseCsvRecords(csv);
    expect(records).toEqual([{ a: "1", b: "2", c: "" }]);
  });

  test("builds contacts with split-name handling and case-insensitive header matching", () => {
    const csv = `Name,email,Custom\n"Doe, Jane",Jane@Example.com,xyz\n`;
    const records = parseCsvRecords(csv);
    const contacts = buildContactsFromRecords({
      body: {
        uploadId: 5,
        audienceId: 9,
        workspaceId: "w1",
        userId: "u1",
        fileContent: "ignored",
        headerMapping: {
          Name: "name",
          EMAIL: "email", // intentionally different case than CSV header
          Custom: "other_data",
        },
        splitNameColumn: "Name",
      },
      records,
      nowIso: "2026-02-25T00:00:00.000Z",
    });

    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({
      workspace: "w1",
      created_by: "u1",
      created_at: "2026-02-25T00:00:00.000Z",
      upload_id: 5,
      firstname: "Jane",
      surname: "Doe",
      email: "Jane@Example.com",
    });
    expect(contacts[0].other_data).toEqual([{ Custom: "xyz" }]);
  });

  test('splits "First Last" format when no comma', () => {
    const csv = `Name\nJane Doe\n`;
    const records = parseCsvRecords(csv);
    const contacts = buildContactsFromRecords({
      body: {
        uploadId: 1,
        audienceId: 1,
        workspaceId: "w1",
        userId: "u1",
        fileContent: "ignored",
        headerMapping: { Name: "name" },
        splitNameColumn: "Name",
      },
      records,
      nowIso: "2026-02-25T00:00:00.000Z",
    });
    expect(contacts[0].firstname).toBe("Jane");
    expect(contacts[0].surname).toBe("Doe");
  });
});

