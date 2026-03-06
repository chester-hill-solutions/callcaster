import { describe, expect, test, vi } from "vitest";
import { logger } from "@/lib/logger.client";
import {
  coalesce,
  createApiResponse,
  createAppError,
  createWebhookPayload,
  debounce,
  deepClone,
  executeDatabaseOperation,
  filterArray,
  getEnvVar,
  getNestedValue,
  getOptionalEnvVar,
  getProperty,
  hasProperty,
  isArray,
  isBoolean,
  isNumber,
  isObject,
  isString,
  mapArray,
  measurePerformance,
  parseFormData,
  safeAsync,
  safeJsonParse,
  throttle,
  validateValue,
} from "@/lib/type-safety-utils";

describe("type-safety-utils", () => {
  test("createAppError and createApiResponse shape", () => {
    const err = createAppError("m", "CODE", { a: 1 }, new Error("orig"));
    expect(err).toMatchObject({ message: "m", code: "CODE", details: { a: 1 } });

    expect(createApiResponse({ ok: 1 })).toEqual({ data: { ok: 1 }, error: undefined, success: true });
    expect(createApiResponse(undefined, err)).toEqual({ data: undefined, error: err, success: false });
  });

  test("type guards", () => {
    expect(isString("x")).toBe(true);
    expect(isString(1)).toBe(false);
    expect(isNumber(1)).toBe(true);
    expect(isNumber(NaN)).toBe(false);
    expect(isBoolean(false)).toBe(true);
    expect(isBoolean("false")).toBe(false);
    expect(isArray([])).toBe(true);
    expect(isArray({})).toBe(false);
    expect(isObject({ a: 1 })).toBe(true);
    expect(isObject(null)).toBe(false);
    expect(isObject([])).toBe(false);
  });

  test("getEnvVar/getOptionalEnvVar", () => {
    const key = "CC_TEST_ENV";
    delete process.env[key];
    expect(() => getEnvVar(key)).toThrow(`Environment variable ${key} is not defined`);
    process.env[key] = "v";
    expect(getEnvVar(key)).toBe("v");
    expect(getOptionalEnvVar(key)).toBe("v");
    delete process.env[key];
    expect(getOptionalEnvVar(key)).toBeUndefined();
  });

  test("parseFormData parses only schema keys", () => {
    const fd = new FormData();
    fd.append("a", "1");
    fd.append("b", "x");
    fd.append("ignored", "nope");
    const parsed = parseFormData<{ a: number; b: string }>(fd, {
      a: (v) => Number(v),
      b: (v) => String(v).toUpperCase(),
    });
    expect(parsed).toEqual({ a: 1, b: "X" });
  });

  test("safeJsonParse returns fallback on invalid JSON", () => {
    expect(safeJsonParse("{", { ok: 1 })).toEqual({ ok: 1 });
    expect(safeJsonParse('{"a":1}', { ok: 1 })).toEqual({ a: 1 });
  });

  test("getProperty/hasProperty", () => {
    const obj = { a: 1, b: "x" };
    expect(getProperty(obj, "a")).toBe(1);
    expect(hasProperty(obj, "a")).toBe(true);
    expect(hasProperty(obj, "nope")).toBe(false);
  });

  test("filterArray/mapArray", () => {
    expect(filterArray([1, 2, 3], (x) => x % 2 === 1)).toEqual([1, 3]);
    expect(mapArray([1, 2, 3], (x) => x * 2)).toEqual([2, 4, 6]);
  });

  test("safeAsync returns fallback on throw", async () => {
    expect(await safeAsync(async () => 1, 0)).toBe(1);
    expect(await safeAsync(async () => { throw new Error("nope"); }, 0)).toBe(0);
  });

  test("validateValue returns error messages for failing rules", () => {
    const res = validateValue("x", [
      { validate: (v) => v.length > 1, message: "too short" },
      { validate: (v) => v.startsWith("y"), message: "wrong prefix" },
    ]);
    expect(res).toEqual({ isValid: false, errors: ["too short", "wrong prefix"] });
    expect(validateValue("yy", [{ validate: (v) => v.startsWith("y"), message: "no" }])).toEqual({
      isValid: true,
      errors: [],
    });
  });

  test("executeDatabaseOperation: error from execute", async () => {
    const res = await executeDatabaseOperation({
      execute: async () => ({ data: null, error: { msg: "db" } }),
    });
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe("DATABASE_ERROR");
  });

  test("executeDatabaseOperation: validate fails", async () => {
    const res = await executeDatabaseOperation({
      execute: async () => ({ data: { ok: false } as any, error: null }),
      validate: (data) => data.ok === true,
    });
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe("VALIDATION_ERROR");
  });

  test("executeDatabaseOperation: success", async () => {
    const res = await executeDatabaseOperation({
      execute: async () => ({ data: { ok: true } as any, error: null }),
    });
    expect(res).toEqual({ data: { ok: true }, error: undefined, success: true });
  });

  test("executeDatabaseOperation: success with null data returns undefined data", async () => {
    const res = await executeDatabaseOperation({
      execute: async () => ({ data: null as any, error: null }),
    });
    expect(res).toEqual({ data: undefined, error: undefined, success: true });
  });

  test("executeDatabaseOperation: unexpected throw", async () => {
    const res = await executeDatabaseOperation({
      execute: async () => {
        throw new Error("boom");
      },
    });
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe("UNEXPECTED_ERROR");
  });

  test("createWebhookPayload", () => {
    expect(createWebhookPayload("cat", "type", "w1", { a: 1 })).toEqual({
      event_category: "cat",
      event_type: "type",
      workspace_id: "w1",
      payload: { a: 1 },
    });
  });

  test("measurePerformance logs debug and returns metrics", async () => {
    const debugSpy = vi.spyOn(logger, "debug");
    const { result, metrics } = await measurePerformance("op", async () => 123);
    expect(result).toBe(123);
    expect(typeof metrics.duration).toBe("number");
    expect(typeof metrics.timestamp).toBe("number");
    expect(debugSpy).toHaveBeenCalledTimes(1);
  });

  test("measurePerformance includes memoryUsage when performance.memory is available", async () => {
    const perfAny = performance as typeof performance & { memory?: { usedJSHeapSize: number } };
    const prevMemory = perfAny.memory;
    perfAny.memory = { usedJSHeapSize: 100 };

    const { metrics } = await measurePerformance("mem", async () => {
      perfAny.memory!.usedJSHeapSize = 150;
      return "ok";
    });
    expect(metrics.memoryUsage).toBe(50);

    perfAny.memory = prevMemory;
  });

  test("debounce delays calls", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 10);
    d(1, 2, 3);
    d(4, 5, 6);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(9);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(4, 5, 6);
    vi.useRealTimers();
  });

  test("throttle only calls when delay passed", () => {
    const fn = vi.fn();
    const t = throttle(fn, 100);
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValueOnce(1000);
    t("a");
    nowSpy.mockReturnValueOnce(1050);
    t("b");
    nowSpy.mockReturnValueOnce(1100);
    t("c");
    expect(fn.mock.calls).toEqual([["a"], ["c"]]);
    nowSpy.mockRestore();
  });

  test("deepClone clones primitives, Date, arrays, objects; skips inherited props", () => {
    expect(deepClone(1)).toBe(1);
    const d = new Date("2020-01-01T00:00:00.000Z");
    const clonedDate = deepClone(d);
    expect(clonedDate).not.toBe(d);
    expect(clonedDate.getTime()).toBe(d.getTime());

    const arr = [1, { a: 2 }];
    const clonedArr = deepClone(arr);
    expect(clonedArr).toEqual(arr);
    expect(clonedArr).not.toBe(arr);

    const proto = { inherited: 1 };
    const obj = Object.create(proto) as any;
    obj.own = { x: 1 };
    const clonedObj = deepClone(obj);
    expect(clonedObj).toEqual({ own: { x: 1 } });
  });

  test("coalesce returns first non-nullish or null", () => {
    expect(coalesce(undefined, null, 0, 1)).toBe(0);
    expect(coalesce(undefined, null)).toBeNull();
  });

  test("getNestedValue returns fallback when path missing", () => {
    expect(getNestedValue({ a: { b: 1 } }, ["a", "b"], 0)).toBe(1);
    expect(getNestedValue({ a: {} }, ["a", "b"], 0)).toBe(0);
    expect(getNestedValue(null, ["a"], "x")).toBe("x");
  });
});

