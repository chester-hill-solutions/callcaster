import { describe, expect, test } from "vitest";
import { parseNumberSearchRequest } from "../app/lib/numbers-search.server";

describe("parseNumberSearchRequest", () => {
  test("requires query value", () => {
    const result = parseNumberSearchRequest(
      new URLSearchParams("searchMode=areaCode"),
    );
    expect(result).toEqual({ ok: false, error: "Enter a search value." });
  });

  test("validates area code", () => {
    expect(
      parseNumberSearchRequest(
        new URLSearchParams("searchMode=areaCode&query=41"),
      ),
    ).toMatchObject({ ok: false });
    expect(
      parseNumberSearchRequest(
        new URLSearchParams("searchMode=areaCode&query=416"),
      ),
    ).toMatchObject({ ok: true, listParams: { areaCode: 416, limit: 20 } });
  });

  test("maps province to inRegion", () => {
    const result = parseNumberSearchRequest(
      new URLSearchParams("searchMode=province&query=on"),
    );
    expect(result).toEqual({
      ok: true,
      listParams: { inRegion: "ON", limit: 20 },
    });
  });

  test("maps city to inLocality", () => {
    const result = parseNumberSearchRequest(
      new URLSearchParams("searchMode=city&query=Toronto"),
    );
    expect(result).toEqual({
      ok: true,
      listParams: { inLocality: "Toronto", limit: 20 },
    });
  });

  test("normalizes postal code", () => {
    const result = parseNumberSearchRequest(
      new URLSearchParams("searchMode=postalCode&query=m5h%202n2"),
    );
    expect(result).toEqual({
      ok: true,
      listParams: { inPostalCode: "M5H 2N2", limit: 20 },
    });
  });
});
