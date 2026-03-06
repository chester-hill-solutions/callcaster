import { describe, expect, test, vi } from "vitest";
import { logger } from "@/lib/logger.client";
import {
  createAppError,
  createErrorResponse,
  createSuccessResponse,
  debounce,
  deepClone,
  filterNonNull,
  formatDate,
  getProperty,
  hasProperty,
  isAppError,
  isArray,
  isBoolean,
  isErrorResponse,
  isJson,
  isNull,
  isNumber,
  isObject,
  isString,
  isSuccessResponse,
  isUndefined,
  mapNonNull,
  mergeObjects,
  optionalChain,
  safeAsync,
  safeBoolean,
  safeDate,
  safeJsonParse,
  safeNumber,
  safeString,
  throttle,
  validateNumber,
  validateRequired,
  validateString,
} from "@/lib/type-utils";

describe("type-utils", () => {
  test("basic type guards", () => {
    expect(isString("x")).toBe(true);
    expect(isNumber(1)).toBe(true);
    expect(isNumber(NaN)).toBe(false);
    expect(isBoolean(true)).toBe(true);
    expect(isNull(null)).toBe(true);
    expect(isUndefined(undefined)).toBe(true);
    expect(isObject({ a: 1 })).toBe(true);
    expect(isObject([])).toBe(false);
    expect(isArray([])).toBe(true);
  });

  test("isJson accepts primitives, arrays, objects; rejects non-JSON", () => {
    expect(isJson("x")).toBe(true);
    expect(isJson(1)).toBe(true);
    expect(isJson(false)).toBe(true);
    expect(isJson(null)).toBe(true);
    expect(isJson([1, { a: "b" }])).toBe(true);
    expect(isJson({ a: [1, 2], b: { c: null } })).toBe(true);
    expect(isJson(() => 1)).toBe(false);
    expect(isJson({ a: undefined })).toBe(false);
  });

  test("getProperty/hasProperty", () => {
    const obj = { a: 1, b: "x" };
    expect(getProperty(obj, "a")).toBe(1);
    expect(hasProperty(obj, "a")).toBe(true);
    expect(hasProperty(obj, "nope")).toBe(false);
  });

  test("safeJsonParse returns fallback on invalid JSON or non-Json value", () => {
    expect(safeJsonParse("{", { ok: 1 })).toEqual({ ok: 1 });
    // JSON.parse can return non-Json (e.g. undefined not representable; function not possible).
    // Here we force a non-Json by parsing a number then expecting a typed object fallback.
    expect(safeJsonParse("1", { ok: 1 })).toEqual(1 as any);

    const parseSpy = vi.spyOn(JSON, "parse").mockReturnValueOnce({ a: undefined } as any);
    expect(safeJsonParse('{"a":1}', { ok: 1 })).toEqual({ ok: 1 });
    parseSpy.mockRestore();
  });

  test("createAppError + response helpers + type guards", () => {
    const err = createAppError("m", "CODE", { a: 1 });
    expect(isAppError(err)).toBe(true);
    expect(isAppError({})).toBe(false);

    const ok = createSuccessResponse({ x: 1 });
    const bad = createErrorResponse(err);

    expect(isSuccessResponse(ok)).toBe(true);
    expect(isErrorResponse(ok)).toBe(false);
    expect(isSuccessResponse(bad)).toBe(false);
    expect(isErrorResponse(bad)).toBe(true);
  });

  test("filterNonNull + mapNonNull", () => {
    expect(filterNonNull([1, null, 2, undefined, 3])).toEqual([1, 2, 3]);
    expect(mapNonNull([1, 2, 3], (x) => (x % 2 ? String(x) : null))).toEqual(["1", "3"]);
  });

  test("optionalChain", () => {
    expect(optionalChain({ a: 1 }, (v) => v.a, 0)).toBe(1);
    expect(optionalChain(null, () => 1, 0)).toBe(0);
  });

  test("safeString/safeNumber/safeBoolean", () => {
    expect(safeString("x")).toBe("x");
    expect(safeString(1)).toBe("1");
    expect(safeString(true)).toBe("true");
    expect(safeString({})).toBe("");

    expect(safeNumber(2)).toBe(2);
    expect(safeNumber("3.5")).toBe(3.5);
    expect(safeNumber("nope")).toBe(0);
    expect(safeNumber({})).toBe(0);

    expect(safeBoolean(true)).toBe(true);
    expect(safeBoolean("TRUE")).toBe(true);
    expect(safeBoolean("false")).toBe(false);
    expect(safeBoolean(1)).toBe(true);
    expect(safeBoolean(0)).toBe(false);
    expect(safeBoolean({})).toBe(false);
  });

  test("safeDate + formatDate", () => {
    const d = new Date("2020-01-01T00:00:00.000Z");
    expect(safeDate(d)?.getTime()).toBe(d.getTime());
    expect(safeDate("2020-01-01") instanceof Date).toBe(true);
    expect(safeDate("not-a-date")).toBeNull();
    expect(safeDate({})).toBeNull();
    expect(formatDate("not-a-date")).toBe("Invalid Date");
    expect(typeof formatDate("2020-01-01")).toBe("string");
  });

  test("mergeObjects + deepClone", () => {
    expect(mergeObjects({ a: 1, b: 2 }, { b: 3 })).toEqual({ a: 1, b: 3 });
    const obj = { a: 1, nested: { b: 2 } } as any;
    const cloned = deepClone(obj);
    expect(cloned).toEqual(obj);
    expect(cloned).not.toBe(obj);
  });

  test("validateRequired/validateString/validateNumber", () => {
    expect(() => validateRequired(null, "x")).toThrow("x is required");
    expect(validateRequired(1, "x")).toBe(1);

    expect(() => validateString("", "name")).toThrow("name must be a non-empty string");
    expect(validateString("a", "name")).toBe("a");

    expect(validateNumber("3", "n")).toBe(3);
    // safeNumber returns 0 for invalid strings; branch checks isNaN only
    expect(validateNumber("nope", "n")).toBe(0);
  });

  test("safeAsync logs and returns fallback on failure", async () => {
    const errSpy = vi.spyOn(logger, "error");
    expect(await safeAsync(async () => 1, 0)).toBe(1);
    expect(await safeAsync(async () => { throw new Error("boom"); }, 0)).toBe(0);
    expect(errSpy).toHaveBeenCalled();
  });

  test("debounce delays calls", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 10);
    d("a");
    d("b");
    vi.advanceTimersByTime(10);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("b");
    vi.useRealTimers();
  });

  test("throttle limits calls", () => {
    const fn = vi.fn();
    const t = throttle(fn, 100);
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValueOnce(1000);
    t("a");
    nowSpy.mockReturnValueOnce(1050);
    t("b");
    nowSpy.mockReturnValueOnce(1200);
    t("c");
    expect(fn.mock.calls).toEqual([["a"], ["c"]]);
    nowSpy.mockRestore();
  });
});

