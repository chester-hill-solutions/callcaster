import { describe, expect, test } from "vitest";

import { getNextContact } from "../app/lib/getNextContact";

describe("getNextContact", () => {
  test("returns null when inputs are missing", () => {
    expect(getNextContact(null as any, {} as any, null as any, false, false)).toBeNull();
    expect(getNextContact([], null as any, { id: 1 } as any, false, false)).toBeNull();
    expect(getNextContact([], {} as any, null as any, false, false)).toBeNull();
  });

  test("non-household mode: finds next contact with phone, wrapping around", () => {
    const queue = [
      { id: 1, contact: { phone: null } },
      { id: 2, contact: { phone: "+1555" } },
      { id: 3, contact: { phone: null } },
    ];

    expect(getNextContact(queue as any, {} as any, queue[0] as any, false, false)).toEqual(queue[1]);
    // From id=2, next with phone wraps around (id=2 itself is at index 1; scan 2..end then 0..1)
    expect(getNextContact(queue as any, {} as any, queue[1] as any, false, false)).toEqual(queue[1]);
  });

  test("groupByHousehold mode (no skip): scans flattened households, wrapping around", () => {
    const a1 = { id: 1, contact: { phone: null } };
    const a2 = { id: 2, contact: { phone: "+1555" } };
    const b1 = { id: 3, contact: { phone: "+1666" } };
    const householdMap = { A: [a1, a2], B: [b1] };
    const queue = [a1, a2, b1];

    expect(getNextContact(queue as any, householdMap as any, a1 as any, true, false)).toEqual(a2);
    expect(getNextContact(queue as any, householdMap as any, a2 as any, true, false)).toEqual(b1);
    // Wrap from last back to first with phone (a2)
    expect(getNextContact(queue as any, householdMap as any, b1 as any, true, false)).toEqual(a2);
  });

  test("groupByHousehold + skipHousehold: prefers next household group, wrapping around", () => {
    const a1 = { id: 1, contact: { phone: "+1555" } };
    const a2 = { id: 2, contact: { phone: "+1777" } };
    const b0 = { id: 30, contact: { phone: null } };
    const b1 = { id: 3, contact: { phone: "+1666" } };
    const householdMap = { A: [a1, a2], B: [b0, b1] };
    const queue = [a1, a2, b0, b1];

    // Starting in household A and skipping, we should move to household B.
    expect(getNextContact(queue as any, householdMap as any, a1 as any, true, true)).toEqual(b1);
    // Starting in household B and skipping, we should wrap to household A's first phone.
    expect(getNextContact(queue as any, householdMap as any, b1 as any, true, true)).toEqual(a1);
  });

  test("returns null when nothing has a phone", () => {
    const q = [
      { id: 1, contact: { phone: null } },
      { id: 2, contact: {} },
    ];
    const hm = { A: q };
    expect(getNextContact(q as any, hm as any, q[0] as any, false, false)).toBeNull();
    expect(getNextContact(q as any, hm as any, q[0] as any, true, false)).toBeNull();
    expect(getNextContact(q as any, hm as any, q[0] as any, true, true)).toBeNull();
  });
});

