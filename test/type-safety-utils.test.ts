import { describe, expect, test, vi } from "vitest";
import {
  coalesce,
  createApiResponse,
  createAppError,
  createWebhookPayload,
  debounce,
  deepClone,
  executeDatabaseOperation,
  getNestedValue,
  isArray,
  isBoolean,
  isNumber,
  isObject,
  isString,
  safeAsync,
  throttle,
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

  test("safeAsync returns fallback on throw", async () => {
    expect(await safeAsync(async () => 1, 0)).toBe(1);
    expect(await safeAsync(async () => { throw new Error("nope"); }, 0)).toBe(0);
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

