import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildContactsFromRecords,
  parseCsvLine,
  parseCsvRecords,
} from "../_shared/audience-upload.ts";

Deno.test("parseCsvLine handles quoted commas", () => {
  assertEquals(parseCsvLine('"Doe, Jane",jane@example.com'), [
    "Doe, Jane",
    "jane@example.com",
  ]);
});

Deno.test("parseCsvRecords handles embedded newlines in quotes", () => {
  const csv = `Name,EMAIL,Custom\r\n"Doe, Jane",jane@example.com,"hello,\nworld"\r\n`;
  assertEquals(parseCsvRecords(csv), [
    {
      Name: "Doe, Jane",
      EMAIL: "jane@example.com",
      Custom: "hello,\nworld",
    },
  ]);
});

Deno.test("parseCsvRecords pads short rows", () => {
  const csv = `a,b,c\n1,2\n`;
  assertEquals(parseCsvRecords(csv), [{ a: "1", b: "2", c: "" }]);
});

Deno.test("buildContactsFromRecords splits comma-separated names", () => {
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
        EMAIL: "email",
        Custom: "other_data",
      },
      splitNameColumn: "Name",
    },
    records,
    nowIso: "2026-02-25T00:00:00.000Z",
  });

  assertEquals(contacts.length, 1);
  assertEquals(contacts[0].firstname, "Jane");
  assertEquals(contacts[0].surname, "Doe");
  assertEquals(contacts[0].email, "Jane@Example.com");
  assertEquals(contacts[0].other_data, [{ Custom: "xyz" }]);
});
