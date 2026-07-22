import { describe, expect, test } from "vitest";
import {
  areaCodeForPhone,
  isWithinRecipientCallingWindow,
  minutesOfDayInZone,
  recipientCallingWindowStatus,
  recipientTimezoneForPhone,
} from "@/lib/recipient-calling-window";
import { NANP_AREA_CODE_TIMEZONES } from "@/lib/nanp-timezones";

describe("app/lib/recipient-calling-window", () => {
  test("areaCodeForPhone handles E.164, national, and garbage", () => {
    expect(areaCodeForPhone("+15551234567")).toBe("555");
    expect(areaCodeForPhone("15551234567")).toBe("555");
    expect(areaCodeForPhone("5551234567")).toBe("555");
    expect(areaCodeForPhone("(416) 555-0100")).toBe("416");
    expect(areaCodeForPhone("+442079460018")).toBeNull();
    expect(areaCodeForPhone("123")).toBeNull();
    expect(areaCodeForPhone(null)).toBeNull();
    expect(areaCodeForPhone("")).toBeNull();
  });

  test("recipientTimezoneForPhone maps major markets", () => {
    expect(recipientTimezoneForPhone("+12125550100")).toBe("America/New_York");
    expect(recipientTimezoneForPhone("+14165550100")).toBe("America/Toronto");
    expect(recipientTimezoneForPhone("+15145550100")).toBe("America/Toronto");
    expect(recipientTimezoneForPhone("+13125550100")).toBe("America/Chicago");
    expect(recipientTimezoneForPhone("+16045550100")).toBe("America/Vancouver");
    expect(recipientTimezoneForPhone("+16025550100")).toBe("America/Phoenix");
    expect(recipientTimezoneForPhone("+17095550100")).toBe("America/St_Johns");
    expect(recipientTimezoneForPhone("+18085550100")).toBe("Pacific/Honolulu");
    // Toll-free has no geography.
    expect(recipientTimezoneForPhone("+18005550100")).toBeNull();
  });

  test("area code index contains no duplicates and only valid IANA zones", () => {
    // buildAreaCodeIndex throws on duplicates at import time; verify zones
    // resolve in Intl so a typo'd zone can't silently disable a region.
    for (const zone of new Set(Object.values(NANP_AREA_CODE_TIMEZONES))) {
      expect(
        () => new Intl.DateTimeFormat("en-US", { timeZone: zone }),
        `invalid IANA zone: ${zone}`,
      ).not.toThrow();
    }
  });

  test("minutesOfDayInZone computes local wall clock", () => {
    // 2026-01-15T14:00:00Z: EST = UTC-5 → 09:00.
    const winter = new Date("2026-01-15T14:00:00Z");
    expect(minutesOfDayInZone("America/New_York", winter)).toBe(9 * 60);
    // Same instant in Los Angeles: 06:00.
    expect(minutesOfDayInZone("America/Los_Angeles", winter)).toBe(6 * 60);
    // Newfoundland is UTC-3:30 in winter → 10:30.
    expect(minutesOfDayInZone("America/St_Johns", winter)).toBe(10 * 60 + 30);
    expect(minutesOfDayInZone("Not/AZone", winter)).toBeNull();
  });

  test("window respects DST transitions", () => {
    // 2026-07-15T12:30:00Z: EDT = UTC-4 → 08:30 (allowed);
    // in winter the same UTC time is 07:30 EST (blocked).
    const summer = new Date("2026-07-15T12:30:00Z");
    const winter = new Date("2026-01-15T12:30:00Z");
    expect(isWithinRecipientCallingWindow("+12125550100", summer)).toBe(true);
    expect(isWithinRecipientCallingWindow("+12125550100", winter)).toBe(false);
    // Phoenix has no DST: 12:30Z is 05:30 MST year-round (blocked).
    expect(isWithinRecipientCallingWindow("+16025550100", summer)).toBe(false);
  });

  test("blocks before 8am and at/after 9pm recipient time", () => {
    // 2026-01-15T12:59Z = 07:59 EST → blocked; 13:00Z = 08:00 → allowed.
    expect(
      isWithinRecipientCallingWindow("+12125550100", new Date("2026-01-15T12:59:00Z")),
    ).toBe(false);
    expect(
      isWithinRecipientCallingWindow("+12125550100", new Date("2026-01-15T13:00:00Z")),
    ).toBe(true);
    // 2026-01-16T01:59Z = 20:59 EST (allowed); 02:00Z = 21:00 → blocked.
    expect(
      isWithinRecipientCallingWindow("+12125550100", new Date("2026-01-16T01:59:00Z")),
    ).toBe(true);
    expect(
      isWithinRecipientCallingWindow("+12125550100", new Date("2026-01-16T02:00:00Z")),
    ).toBe(false);
  });

  test("unknown timezone degrades to the conservative all-zones window", () => {
    // 2026-01-15T19:00:00Z: Honolulu 09:00, St. John's 15:30 — both inside.
    const safe = new Date("2026-01-15T19:00:00Z");
    // 2026-01-15T15:00:00Z: Honolulu 05:00 — Hawaii is outside the window.
    const early = new Date("2026-01-15T15:00:00Z");
    expect(recipientCallingWindowStatus("+18005550100", safe)).toEqual({
      allowed: true,
      timezone: null,
      reason: "unknown_timezone_safe",
    });
    expect(recipientCallingWindowStatus("+18005550100", early)).toEqual({
      allowed: false,
      timezone: null,
      reason: "unknown_timezone_blocked",
    });
    // Entirely non-NANP numbers get the same conservative treatment.
    expect(recipientCallingWindowStatus("+442079460018", early).allowed).toBe(
      false,
    );
  });

  test("status reports the zone for known numbers", () => {
    const status = recipientCallingWindowStatus(
      "+16135550100",
      new Date("2026-01-15T14:00:00Z"),
    );
    expect(status).toEqual({
      allowed: true,
      timezone: "America/Toronto",
      reason: "in_window",
    });
  });
});
