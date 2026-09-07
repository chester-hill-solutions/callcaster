import { and, or, type SQL } from "drizzle-orm";

/**
 * Non-empty SQL condition combinators (roadmap E6.3).
 *
 * drizzle's `and()` / `or()` return `undefined` for an empty list, which
 * silently turns a filter into "match everything". Two modules used to carry
 * their own copy of the guard; this is the one place, with one failure
 * policy: an empty list is a programming error and throws, naming the caller.
 */
export type NonEmptyArray<T> = [T, ...T[]];

/** Narrow a dynamically built list at the boundary; throws with `context` when empty. */
export function requireConditions(conditions: readonly SQL[], context: string): NonEmptyArray<SQL> {
  const [first, ...rest] = conditions;
  if (first === undefined) {
    throw new Error(`${context} requires at least one SQL condition`);
  }
  return [first, ...rest];
}

/** `and()` over a list that the type system already guarantees is non-empty. */
export function andAll(conditions: NonEmptyArray<SQL>): SQL {
  return and(...conditions) as SQL;
}

/** `or()` over a list that the type system already guarantees is non-empty. */
export function orAny(conditions: NonEmptyArray<SQL>): SQL {
  return or(...conditions) as SQL;
}

/** Convenience for call sites that build the list dynamically. */
export function andConditions(conditions: readonly SQL[], context: string): SQL {
  return andAll(requireConditions(conditions, context));
}

export function orConditions(conditions: readonly SQL[], context: string): SQL {
  return orAny(requireConditions(conditions, context));
}
