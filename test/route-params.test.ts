import { describe, expect, test } from "vitest";
import {
  parsePositiveIntegerParam,
  requirePositiveIntegerParam,
} from "@/lib/route-params";

describe("app/lib/route-params.ts", () => {
  test("parses positive integer strings only", () => {
    expect(parsePositiveIntegerParam("910001")).toBe(910001);
    expect(parsePositiveIntegerParam(" 42 ")).toBe(42);
    for (const bad of ["blah", "0", "-1", "1.5", "1e3", "", undefined, null, "0x10", "99999999999999999999"]) {
      expect(parsePositiveIntegerParam(bad), String(bad)).toBeNull();
    }
  });

  test("requirePositiveIntegerParam throws a 404 Response carrying the given headers (#1682)", () => {
    expect(requirePositiveIntegerParam("7")).toBe(7);
    let thrown: unknown;
    try {
      requirePositiveIntegerParam("blah", { "set-cookie": "session=abc" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(404);
    expect((thrown as Response).headers.get("set-cookie")).toBe("session=abc");
  });
});
