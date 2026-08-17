import { describe, expect, test } from "vitest";
import {
  getPostgresErrorCode,
  isForeignKeyViolation,
  isInvalidTextRepresentation,
  isNotFoundError,
  isUniqueViolation,
  PG_ERROR_CODES,
} from "../app/lib/parse-utils.server";

/** Mimics drizzle-orm's DrizzleQueryError: no `code`, driver error on `cause`. */
function drizzleWrapped(code: string): Error {
  const cause = Object.assign(new Error("driver error"), { code });
  const wrapper = new Error("Failed query: insert into campaign ...");
  (wrapper as Error & { cause: unknown }).cause = cause;
  return wrapper;
}

describe("getPostgresErrorCode", () => {
  test("reads a direct code", () => {
    expect(getPostgresErrorCode({ code: "23505" })).toBe("23505");
  });

  test("unwraps a Drizzle-style cause chain", () => {
    expect(getPostgresErrorCode(drizzleWrapped("23505"))).toBe("23505");
  });

  test("unwraps nested causes more than one level deep", () => {
    const inner = Object.assign(new Error("pg"), { code: "22P02" });
    const mid = new Error("mid");
    (mid as Error & { cause: unknown }).cause = inner;
    const outer = new Error("outer");
    (outer as Error & { cause: unknown }).cause = mid;
    expect(getPostgresErrorCode(outer)).toBe("22P02");
  });

  test("returns null for non-objects and codeless errors", () => {
    expect(getPostgresErrorCode(null)).toBeNull();
    expect(getPostgresErrorCode("boom")).toBeNull();
    expect(getPostgresErrorCode(new Error("plain"))).toBeNull();
  });

  test("does not loop on circular cause chains", () => {
    const a = new Error("a");
    const b = new Error("b");
    (a as Error & { cause: unknown }).cause = b;
    (b as Error & { cause: unknown }).cause = a;
    expect(getPostgresErrorCode(a)).toBeNull();
  });
});

describe("pg error predicates", () => {
  test("match direct and Drizzle-wrapped shapes", () => {
    expect(isUniqueViolation({ code: PG_ERROR_CODES.UNIQUE_VIOLATION })).toBe(true);
    expect(isUniqueViolation(drizzleWrapped("23505"))).toBe(true);
    expect(isUniqueViolation(drizzleWrapped("23503"))).toBe(false);

    expect(isForeignKeyViolation(drizzleWrapped("23503"))).toBe(true);
    expect(isInvalidTextRepresentation(drizzleWrapped("22P02"))).toBe(true);
    expect(isNotFoundError({ code: PG_ERROR_CODES.POSTGREST_NOT_FOUND })).toBe(true);
  });

  test("reject unrelated errors", () => {
    expect(isUniqueViolation(new Error("duplicate key"))).toBe(false);
    expect(isForeignKeyViolation(undefined)).toBe(false);
    expect(isInvalidTextRepresentation({ code: 22 })).toBe(false);
    expect(isNotFoundError(new Error("missing"))).toBe(false);
  });
});
