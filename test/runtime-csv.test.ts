import { describe, expect, test } from "vitest";
import { parse } from "csv-parse/sync";
import { parseCSV as parseServer } from "@/lib/csv";
import { parseCSV as parseContacts } from "@/lib/csv-contacts";
import {
  parseCSV as parseAudience,
  parseCSVAsync,
} from "@/components/audience/audience-upload-csv";

describe("runtime CSV security", () => {
  test("duplicate __proto__ columns remain data without replacing the record prototype", () => {
    const [record] = parse("__proto__,__proto__,role\nEVIL1,EVIL2,admin", {
      columns: true,
      group_columns_by_name: true,
    });

    expect(Object.getPrototypeOf(record)).toBe(Object.prototype);
    expect(Object.hasOwn(record, "__proto__")).toBe(true);
    expect(record.__proto__).toEqual(["EVIL1", "EVIL2"]);
    expect(record.role).toBe("admin");
    expect(record.length).toBeUndefined();
    expect(record["1"]).toBeUndefined();
    expect(record["2"]).toBeUndefined();
  });

  test("ordinary duplicate columns still group their values", () => {
    expect(parse("name,name,role\nJane,Doe,member", {
      columns: true,
      group_columns_by_name: true,
    })).toEqual([{ name: ["Jane", "Doe"], role: "member" }]);
  });
});

describe("runtime CSV import compatibility", () => {
  test("retains empty preview results and empty contact-file rejection", async () => {
    expect(parseServer("")).toEqual({ headers: [], contacts: [] });
    expect(parseAudience("")).toEqual({ headers: [], contacts: [] });
    expect(await parseCSVAsync("")).toEqual({ headers: [], contacts: [] });
    expect(() => parseContacts("")).toThrow("Failed to parse CSV file");
  });

  test.each([
    { name: "quoted comma", cell: '"Jane, Doe"', expected: "Jane, Doe" },
    { name: "escaped quotes", cell: '"Jane ""JD"" Doe"', expected: 'Jane "JD" Doe' },
    { name: "embedded newline", cell: '"Jane\nDoe"', expected: "Jane\nDoe" },
    { name: "BOM", cell: "Jane", expected: "Jane", bom: "\ufeff" },
  ])("preserves $name in the server and both audience parsers", async ({ cell, expected, bom = "" }) => {
    const csv = `${bom}Name,Phone\r\n${cell},+14165551234\r\n`;
    expect(parseServer(csv)).toEqual({
      headers: ["Name", "Phone"],
      contacts: [{ Name: expected, Phone: "+14165551234" }],
    });
    const expectedAudience = {
      headers: ["name", "phone"],
      contacts: [{ name: expected, phone: "+14165551234" }],
    };
    expect(parseAudience(csv)).toEqual(expectedAudience);
    expect(await parseCSVAsync(csv)).toEqual(expectedAudience);
  });

  test("keeps the first headerless row in every import parser", async () => {
    const csv = "Jane,+14165551234\nJohn,+14165550000\n";
    const expected = {
      headers: ["Column 1", "Column 2"],
      contacts: [
        { "Column 1": "Jane", "Column 2": "+14165551234" },
        { "Column 1": "John", "Column 2": "+14165550000" },
      ],
    };
    expect(parseServer(csv)).toEqual(expected);
    expect(parseAudience(csv)).toEqual(expected);
    expect(await parseCSVAsync(csv)).toEqual(expected);
  });

  test("retains the final value for an ordinary duplicate header", async () => {
    const csv = "Name,Phone,Phone\nJane,+14165551111,+14165552222\n";
    expect(parseServer(csv)).toEqual({
      headers: ["Name", "Phone", "Phone"],
      contacts: [{ Name: "Jane", Phone: "+14165552222" }],
    });
    const expectedAudience = {
      headers: ["name", "phone", "phone"],
      contacts: [{ name: "Jane", phone: "+14165552222" }],
    };
    expect(parseAudience(csv)).toEqual(expectedAudience);
    expect(await parseCSVAsync(csv)).toEqual(expectedAudience);
  });

  test("retains complete records across the audience batch boundary", async () => {
    const rows = Array.from({ length: 2001 }, (_, index) => `Person ${index},+14165551234`);
    rows[1999] = '"Boundary\nPerson",+14165552222';
    rows[2000] = '"Final ""Person""",+14165553333';
    const result = await parseCSVAsync(["Name,Phone", ...rows].join("\r\n"));
    expect(result.headers).toEqual(["name", "phone"]);
    expect(result.contacts).toHaveLength(2001);
    expect(result.contacts[0]).toEqual({ name: "Person 0", phone: "+14165551234" });
    expect(result.contacts[1999]).toEqual({ name: "Boundary\nPerson", phone: "+14165552222" });
    expect(result.contacts[2000]).toEqual({ name: 'Final "Person"', phone: "+14165553333" });
  });

  test("preserves consent values through upload parsing and contact mapping", async () => {
    const csv = "firstname,email,opt_out\nJane,JANE@example.com,unsubscribe\nJohn,john@example.com,no\nJo,jo@example.com,pending review\n";
    const expectedRows = [
      { firstname: "Jane", email: "JANE@example.com", opt_out: "unsubscribe" },
      { firstname: "John", email: "john@example.com", opt_out: "no" },
      { firstname: "Jo", email: "jo@example.com", opt_out: "pending review" },
    ];
    expect(parseServer(csv).contacts).toEqual(expectedRows);
    expect(parseAudience(csv).contacts).toEqual(expectedRows);
    expect((await parseCSVAsync(csv)).contacts).toEqual(expectedRows);
    expect(parseContacts(csv).contacts).toMatchObject([
      { firstname: "Jane", email: "jane@example.com", opt_out: true },
      { firstname: "John", email: "john@example.com", opt_out: false },
      { firstname: "Jo", email: "jo@example.com", opt_out: true },
    ]);
  });

  test("rejects an unfinished quoted cell in every parser", async () => {
    const csv = 'Name,Phone\n"Jane,+14165551234';
    expect(() => parseServer(csv)).toThrow();
    expect(() => parseContacts(csv)).toThrow("Failed to parse CSV file");
    expect(() => parseAudience(csv)).toThrow("Failed to parse CSV file");
    await expect(parseCSVAsync(csv)).rejects.toThrow("Failed to parse CSV file");
  });

  test("retains the different missing-column policies for server and preview", async () => {
    const csv = "Name,Phone\nJane\n";
    expect(parseServer(csv)).toEqual({
      headers: ["Name", "Phone"],
      contacts: [{ Name: "Jane", Phone: "" }],
    });
    expect(() => parseAudience(csv)).toThrow("Failed to parse CSV file");
    await expect(parseCSVAsync(csv)).rejects.toThrow("Failed to parse CSV file");
  });
});
