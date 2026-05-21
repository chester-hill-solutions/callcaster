import { describe, expect, test } from "vitest";
import {
  jsonNumbersSearchResponse,
  mapTwilioAvailableNumbers,
} from "@/lib/numbers-search.server";

describe("numbers-search.server", () => {
  test("mapTwilioAvailableNumbers filters incomplete rows", () => {
    expect(
      mapTwilioAvailableNumbers([
        { phoneNumber: "+15551234567", friendlyName: "Line 1" },
        { phoneNumber: "+15557654321" },
        { friendlyName: "No phone" },
      ]),
    ).toEqual([
      {
        phoneNumber: "+15551234567",
        friendlyName: "Line 1",
        region: undefined,
        locality: undefined,
        capabilities: {},
      },
    ]);
  });

  test("jsonNumbersSearchResponse sets status from ok flag", async () => {
    const ok = jsonNumbersSearchResponse({ ok: true, numbers: [] });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, numbers: [] });

    const err = jsonNumbersSearchResponse({ ok: false, error: "bad" });
    expect(err.status).toBe(400);
    expect(await err.json()).toEqual({ ok: false, error: "bad" });
  });
});
