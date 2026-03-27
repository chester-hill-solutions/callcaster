import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

const logger = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("@/lib/logger.server", () => ({ logger }));

describe("app/lib/utils.ts", () => {
  beforeEach(() => {
    vi.useRealTimers();
    logger.error.mockReset();
    logger.warn.mockReset();
    logger.info.mockReset();
    logger.debug.mockReset();
  });

  test("cn merges class names", async () => {
    const mod = await import("../app/lib/utils");
    expect(mod.cn("a", false && "no", ["b", "c"])).toContain("a");
    expect(mod.cn("a", "b")).toContain("b");
  });

  test("formatDateToLocale returns locale string", async () => {
    const mod = await import("../app/lib/utils");
    const s = "2020-01-01T00:00:00.000Z";
    expect(mod.formatDateToLocale(s)).toBe(new Date(s).toLocaleString());
  });

  test("capitalize, stripPhoneNumber, formatTableText", async () => {
    const mod = await import("../app/lib/utils");
    expect(mod.capitalize("hello")).toBe("Hello");
    expect(mod.capitalize("")).toBe("");
    expect(mod.stripPhoneNumber("(555) 555-0100")).toBe("5555550100");
    expect(mod.formatTableText("hello_world-test/ok")).toBe("Hello World Test Ok");
  });

  test("isRecent uses 24h cutoff", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2020-01-02T00:00:00.000Z"));
    const mod = await import("../app/lib/utils");
    expect(mod.isRecent("2020-01-01T23:00:00.000Z")).toBe(true);
    expect(mod.isRecent("2020-01-01T00:00:00.000Z")).toBe(false);
  });

  describe("deepEqual", () => {
    test("handles primitives, nullish, type mismatch", async () => {
      const { deepEqual } = await import("../app/lib/utils");
      expect(deepEqual(1, 1)).toBe(true);
      expect(deepEqual(1, 2)).toBe(false);
      expect(deepEqual(null, null)).toBe(true);
      expect(deepEqual(null, 1)).toBe(false);
      expect(deepEqual({ a: 1 }, [1] as any)).toBe(false);
    });

    test("handles Date and RegExp comparisons", async () => {
      const { deepEqual } = await import("../app/lib/utils");
      expect(deepEqual(new Date("2020-01-01"), new Date("2020-01-01"))).toBe(
        true,
      );
      expect(deepEqual(new Date("2020-01-01"), new Date("2020-01-02"))).toBe(
        false,
      );
      expect(deepEqual(/a/i, /a/i)).toBe(true);
      expect(deepEqual(/a/i, /b/i)).toBe(false);
    });

    test("handles arrays and objects (including cycles)", async () => {
      const { deepEqual } = await import("../app/lib/utils");
      expect(deepEqual([1, 2], [1, 2])).toBe(true);
      expect(deepEqual([1, 2], [2, 1])).toBe(false);
      expect(deepEqual([1], [1, 2])).toBe(false);

      expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
      expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
      // Covers "extra keys in first object" logging branch.
      expect(deepEqual({ a: 1, b: 2 }, { a: 1 } as any)).toBe(false);
      expect(deepEqual({ a: 1, b: 2 }, { a: 1, c: 2 } as any)).toBe(false);

      const o1: any = { a: 1 };
      const o2: any = { a: 1 };
      o1.self = o1;
      o2.self = o2;
      expect(deepEqual(o1, o2)).toBe(true);
    });
  });

  test("parseCSV parses and maps common headers", async () => {
    const mod = await import("../app/lib/utils");
    const csv = [
      // Note: header mapping regex matches opt-out with hyphen/underscore, not space.
      "First Name,Last Name,Phone,Email,Opt-Out,Custom",
      "Ada,Lovelace,555-555-0100,ADA@EXAMPLE.com,yes,Value",
      "Bob,,+1 (555) 555-0199,bob@example.com,false,",
      "Solo,,5555,not-an-email,0,More",
      "",
    ].join("\n");

    const res = mod.parseCSV(csv);
    expect(res.headers).toEqual([
      "first name",
      "last name",
      "phone",
      "email",
      "opt-out",
      "custom",
    ]);

    expect(res.contacts[0]).toMatchObject({
      firstname: "Ada",
      surname: "Lovelace",
      email: "ada@example.com",
      opt_out: true,
    });
    // parsePhoneNumber adds + and pads with +1 if short; returns null on invalid length.
    expect([res.contacts[0].phone, res.contacts[2].phone]).toEqual([
      "+15555550100",
      null,
    ]);
    expect(res.contacts[1]).toMatchObject({
      firstname: "Bob",
      surname: null,
      opt_out: false,
    });
    expect(res.contacts[2].email).toBeNull();
    // Unmapped header goes to other_data when present.
    expect(res.contacts[0].other_data).toEqual([{ custom: "Value" }]);
  });

  test("parseCSV handles name mapping, phone edge-cases, and empty opt-out", async () => {
    const mod = await import("../app/lib/utils");
    const csv = [
      "Name,Phone,Opt-Out,External ID,Address,City,Postal,Province,Country",
      // name (1 part), phone with '+' not at start, empty opt-out => Boolean(null) false
      "Prince,1+5555550100,,X,1 Main,Metropolis,12345,ON,CA",
      // name (2 parts)
      "John Doe,,,W,0 Main,Smallville,00000,KS,US",
      // name (>2 parts), empty phone => parsePhoneNumber returns empty string
      "Mary Jane Smith,,,Y,2 Main,Gotham,99999,NY,US",
      // empty name => parseName returns empty strings
      ",555-555-0100,,Z,3 Main,Star City,11111,BC,CA",
    ].join("\n");
    const res = mod.parseCSV(csv);
    expect(res.contacts[0]).toMatchObject({
      firstname: "Prince",
      surname: null,
      phone: "+15555550100",
      opt_out: false,
      external_id: "X",
      address: "1 Main",
      city: "Metropolis",
      postal: "12345",
      province: "ON",
      country: "CA",
    });
    expect(res.contacts[1]).toMatchObject({
      firstname: "John",
      surname: "Doe",
      phone: "",
      opt_out: false,
      external_id: "W",
    });
    expect(res.contacts[2]).toMatchObject({
      firstname: "Mary",
      surname: "Jane Smith",
      phone: "",
      opt_out: false,
      external_id: "Y",
    });
    expect(res.contacts[3]).toMatchObject({
      firstname: "",
      surname: "",
      phone: "+15555550100",
      opt_out: false,
      external_id: "Z",
    });
  });

  test("parseCSV logs and throws on parse error", async () => {
    vi.resetModules();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.doMock("csv-parse/sync", () => ({ parse: () => {
      throw new Error("bad");
    }}));
    const mod = await import("../app/lib/utils");
    expect(() => mod.parseCSV("x")).toThrow("Failed to parse CSV file");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  test("parseCSV logs and throws on internal mapping errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mod = await import("../app/lib/utils");
    const csv = ["Email", ""].join("\n"); // empty value becomes null => parseEmail throws
    expect(() => mod.parseCSV(csv)).toThrow("Failed to parse CSV file");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  test("campaignTypeText maps known types and default", async () => {
    const mod = await import("../app/lib/utils");
    expect(mod.campaignTypeText("message")).toBe("Message");
    expect(mod.campaignTypeText("robocall")).toBe("Robocall");
    expect(mod.campaignTypeText("simple_ivr")).toBe("Simple IVR");
    expect(mod.campaignTypeText("complex_ivr")).toBe("Complex IVR");
    expect(mod.campaignTypeText("live_call")).toBe("Live Call");
    expect(mod.campaignTypeText("nope")).toBe("Invalid");
  });

  test("sortQueue sorts by attempts desc then id then queue_order", async () => {
    const mod = await import("../app/lib/utils");
    const q: any[] = [
      { id: 2, attempts: 1, queue_order: 2 },
      { id: 1, attempts: 2, queue_order: 1 },
      { id: 1, attempts: 2, queue_order: 0 },
      { id: 3, attempts: 1, queue_order: 0 },
    ];
    const sorted = mod.sortQueue(q as any);
    expect(sorted.map((x) => `${x.attempts}-${x.id}-${x.queue_order}`)).toEqual([
      "2-1-0",
      "2-1-1",
      "1-2-2",
      "1-3-0",
    ]);
  });

  test("createHouseholdMap groups by address and creates NO_ADDRESS buckets", async () => {
    const mod = await import("../app/lib/utils");
    const q: any[] = [
      { contact: { address: "A" } },
      { contact: { address: "A" } },
      { contact: { address: "B" } },
      { contact: { address: "" } },
      { contact: {} },
    ];
    const map = mod.createHouseholdMap(q as any);
    expect(map.A).toHaveLength(2);
    expect(map.B).toHaveLength(1);
    expect(Object.keys(map).some((k) => k.startsWith("NO_ADDRESS_"))).toBe(true);
  });

  test("updateAttemptWithCall merges result and conditionally sets status", async () => {
    const mod = await import("../app/lib/utils");

    const baseAttempt: any = { result: { a: 1 } };
    const callOk: any = { status: "completed", direction: "outbound-call" };
    const callApi: any = { status: "completed", direction: "outbound-api" };
    const callNoStatus: any = { direction: "outbound-call" };

    expect(mod.updateAttemptWithCall(baseAttempt, null as any).result).toEqual({
      a: 1,
    });
    expect(mod.updateAttemptWithCall(baseAttempt, callOk).result).toEqual({
      a: 1,
      status: "completed",
    });
    expect(mod.updateAttemptWithCall(baseAttempt, callApi).result).toEqual({
      a: 1,
    });
    expect(mod.updateAttemptWithCall(baseAttempt, callNoStatus).result).toEqual({
      a: 1,
    });
  });

  test("playTone returns early without audioContext; otherwise schedules oscillators", async () => {
    const mod = await import("../app/lib/utils");
    expect(mod.playTone("1", null as any)).toBeUndefined();

    const freq1 = { setValueAtTime: vi.fn() };
    const freq2 = { setValueAtTime: vi.fn() };
    const osc1 = {
      type: "",
      frequency: freq1,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const osc2 = {
      type: "",
      frequency: freq2,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const gain = {
      gain: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
    };
    const audioContext: any = {
      currentTime: 10,
      destination: {},
      createOscillator: vi.fn(() => (audioContext.__created++ % 2 === 0 ? osc1 : osc2)),
      createGain: vi.fn(() => gain),
      __created: 0,
    };

    mod.playTone("1", audioContext);
    expect(audioContext.createOscillator).toHaveBeenCalledTimes(2);
    expect(audioContext.createGain).toHaveBeenCalledTimes(1);
    expect(freq1.setValueAtTime).toHaveBeenCalled();
    expect(freq2.setValueAtTime).toHaveBeenCalled();
    expect(osc1.start).toHaveBeenCalled();
    expect(osc2.start).toHaveBeenCalled();
    expect(osc1.stop).toHaveBeenCalledWith(10 + 0.15);
    expect(osc2.stop).toHaveBeenCalledWith(10 + 0.15);
  });

  test("formatTime formats hh:mm:ss", async () => {
    const mod = await import("../app/lib/utils");
    expect(mod.formatTime(0)).toBe("00:00:00");
    expect(mod.formatTime(3600 + 61)).toBe("01:01:01");
  });

  test("isPhoneNumber validates common formats and length", async () => {
    const mod = await import("../app/lib/utils");
    expect(mod.isPhoneNumber("555-555-0100")).toBe(true);
    expect(mod.isPhoneNumber("+15555550100")).toBe(true);
    expect(mod.isPhoneNumber("123")).toBe(false);
    expect(mod.isPhoneNumber("+" + "1".repeat(40))).toBe(false);
  });

  test("isEmail validates structure and length rules", async () => {
    const mod = await import("../app/lib/utils");
    expect(mod.isEmail("a@b.co")).toBe(true);
    expect(mod.isEmail("bad")).toBe(false);
    expect(mod.isEmail("a@b")).toBe(false); // no dot
    expect(mod.isEmail("a@b.c")).toBe(false); // tld too short
    expect(mod.isEmail("a".repeat(65) + "@example.com")).toBe(false); // local too long
    expect(mod.isEmail("a@"+ "b".repeat(260) + ".com")).toBe(false); // domain too long
    expect(mod.isEmail("a".repeat(255) + "@b.co")).toBe(false); // email too long
  });

  test("normalizePhoneNumber normalizes and throws on invalid length", async () => {
    const mod = await import("../app/lib/utils");
    expect(mod.normalizePhoneNumber("555-555-0100")).toBe("+15555550100");
    // A '+' not at the start is removed; this becomes a normal +1... number.
    expect(mod.normalizePhoneNumber("1+5555550100")).toBe("+15555550100");
    expect(mod.normalizePhoneNumber("+15555550100")).toBe("+15555550100");
    expect(() => mod.normalizePhoneNumber("5555")).toThrow("Invalid phone number length");
  });

  test("handleNavlinkStyles returns active/pending/default styles", async () => {
    const mod = await import("../app/lib/utils");
    expect(mod.handleNavlinkStyles(true, false)).toContain("bg-brand-secondary");
    expect(mod.handleNavlinkStyles(false, true)).toContain("bg-brand-tertiary");
    expect(mod.handleNavlinkStyles(false, false)).toContain("hover:bg-zinc-100");
  });

  test("getAllKeys recurses objects and supports Set and object targets", async () => {
    const mod = await import("../app/lib/utils");
    const obj = { a: 1, nested: { b: 2 }, arr: [{ c: 3 }] };

    const s = mod.getAllKeys(obj, "p_") as Set<string>;
    expect(s.has("p_a")).toBe(true);
    expect(s.has("p_nested_b")).toBe(true);
    // Arrays are treated as leaf values (not recursed)
    expect(s.has("p_arr")).toBe(true);

    const rec = mod.getAllKeys(obj, "p_", {}) as Record<string, unknown>;
    expect(rec).toMatchObject({
      p_a: 1,
      p_nested_b: 2,
    });
    expect(Array.isArray(rec.p_arr)).toBe(true);
  });

  test("getAllKeys supports default args", async () => {
    const mod = await import("../app/lib/utils");
    const s = mod.getAllKeys({ a: 1, nested: { b: 2 } }) as Set<string>;
    expect(s.has("a")).toBe(true);
    expect(s.has("nested_b")).toBe(true);
  });

  test("getAllKeys ignores non-object targets", async () => {
    const mod = await import("../app/lib/utils");
    const out = mod.getAllKeys({ a: 1 }, "", 1 as any);
    expect(out).toBe(1);
  });

  test("escapeCSV and generateCSVContent handle quoting, BOM, and 0/false", async () => {
    const mod = await import("../app/lib/utils");
    expect(mod.escapeCSV(null)).toBe("");
    expect(mod.escapeCSV('a,"b"')).toBe('"a,""b"""');

    const headers = ["a", "b", "c"];
    const data = [{ a: 0, b: false }, { a: "x,y", b: "z" }];
    const out = mod.generateCSVContent(headers, data as any);
    expect(out.startsWith("\ufeff")).toBe(true);
    expect(out).toContain("a,b,c\n");
    expect(out).toContain('0,false,\n');
    expect(out).toContain('"x,y",z,\n');
  });

  test("extractKeys and flattenRow extract dynamic/result/other_data keys and rename ids", async () => {
    const mod = await import("../app/lib/utils");
    const data: any[] = [
      {
        id: 10,
        contact_id: 20,
        user_id: "u1",
        created_at: "2020-01-01T00:00:00.000Z",
        contact: { other_data: [{ extra: "v" }, null, "skip"] },
        result: { r1: 1 },
      },
      {
        id: 11,
        contact_id: 21,
        user_id: "u2",
        created_at: "2020-01-01T00:00:00.000Z",
        contact: { other_data: null },
        result: null,
      },
    ];
    const users = [{ id: "u1", username: "alice" }];

    const keys = mod.extractKeys(data as any);
    expect(Array.from(keys.dynamicKeys)).toContain("id");
    expect(Array.from(keys.resultKeys)).toContain("r1");
    expect(Array.from(keys.otherDataKeys)).toContain("other_data_0_extra");

    const flat = mod.flattenRow(data[0], users);
    expect(flat).toMatchObject({
      attempt_id: 10,
      callcaster_id: 20,
      user_id: "alice",
      result_r1: 1,
      other_data_0_extra: "v",
    });
    expect("contact_other_data" in flat).toBe(false);

    const flatNoUser = mod.flattenRow(data[0], []);
    expect(flatNoUser.user_id).toBe("u1");

    const flatNoExtras = mod.flattenRow(
      { user_id: "u2", created_at: "2020-01-01T00:00:00.000Z", contact: {} },
      users,
    );
    expect(flatNoExtras.user_id).toBe("u2");
    expect("attempt_id" in flatNoExtras).toBe(false);
    expect("callcaster_id" in flatNoExtras).toBe(false);
  });

  test("processTemplateTags replaces fields, fallbacks, and btoa()", async () => {
    const mod = await import("../app/lib/utils");
    const contact: any = {
      firstname: "Ada",
      surname: "Lovelace",
      phone: "+15555550100",
      email: "ada@example.com",
      external_id: "X",
      address: "",
      city: "London",
      province: "LN",
      postal: "ABC",
      country: "UK",
    };

    expect(mod.processTemplateTags("", contact)).toBe("");
    expect(mod.processTemplateTags("hi", null as any)).toBe("hi");
    expect(mod.processTemplateTags("{firstname} {surname}", contact)).toBe(
      "Ada Lovelace",
    );
    expect(mod.processTemplateTags("{email}", contact)).toBe("ada@example.com");
    expect(mod.processTemplateTags("{unknown|fallback}", contact)).toBe(
      "fallback",
    );
    expect(mod.processTemplateTags("{unknown}", contact)).toBe("");
    expect(mod.processTemplateTags("{fullname}", contact)).toBe("Ada Lovelace");
    expect(mod.processTemplateTags("{address|N/A}", contact)).toBe("N/A");
    expect(
      mod.processTemplateTags("{city},{province} {postal} {country}", contact),
    ).toBe("London,LN ABC UK");

    const nodeB64 = mod.processTemplateTags("btoa({phone}:{external_id})", contact);
    expect(nodeB64).toBe(Buffer.from(`${contact.phone}:${contact.external_id}`, "utf-8").toString("base64"));

    // Prefer window.btoa when present.
    (globalThis as any).window = { btoa: vi.fn((s: string) => `WIN:${s}`) };
    expect(mod.processTemplateTags("btoa({phone})", contact)).toBe(
      `WIN:${contact.phone}`,
    );

    // Cover error path for btoa processing
    (globalThis as any).window = {
      btoa: () => {
        throw new Error("nope");
      },
    };
    expect(mod.processTemplateTags("btoa({phone})", contact)).toBe("");
    delete (globalThis as any).window;

    // Cover all "field || ''" branches
    const empty: any = {
      firstname: "",
      surname: "",
      fullname: "",
      phone: null,
      email: null,
      address: null,
      city: null,
      province: null,
      postal: null,
      country: null,
      external_id: null,
    };
    expect(
      mod.processTemplateTags(
        "{firstname}{surname}{fullname}{phone}{email}{address}{city}{province}{postal}{country}{external_id}",
        empty,
      ),
    ).toBe("");
  });

  test("days constant is stable", async () => {
    const mod = await import("../app/lib/utils");
    expect(mod.days).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
  });
});

