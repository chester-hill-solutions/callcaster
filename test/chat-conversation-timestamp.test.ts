import { describe, expect, it } from "vitest";

import { toConversationTimestamp } from "../app/lib/chat-conversation-sort";

/**
 * #2213 re-declared `message.date_created` as `timestamptz`, so
 * `Tables<"message">` now says `Date`. `ConversationSummary` still holds ISO
 * strings, and `useChatRealtime` fills it from a realtime payload that crossed
 * JSON — where a Date arrives as a string. Both arms are therefore live, and
 * neither may be assumed: a Date handed to the React state would be a type lie
 * that `new Date(...)` downstream would still have to rescue.
 */
describe("toConversationTimestamp", () => {
  it("renders a Date as ISO", () => {
    expect(toConversationTimestamp(new Date("2026-06-01T10:00:00.000Z"))).toBe(
      "2026-06-01T10:00:00.000Z",
    );
  });

  it("normalises an ISO string to the same ISO string", () => {
    expect(toConversationTimestamp("2026-06-01T10:00:00.000Z")).toBe(
      "2026-06-01T10:00:00.000Z",
    );
  });

  it("returns the same instant for either arm of the union", () => {
    const when = new Date("2026-06-01T10:00:00.000Z");
    expect(toConversationTimestamp(when)).toBe(toConversationTimestamp(when.toISOString()));
  });

  it("passes null and undefined through as null", () => {
    expect(toConversationTimestamp(null)).toBeNull();
    expect(toConversationTimestamp(undefined)).toBeNull();
  });

  it("returns null rather than an Invalid Date for junk", () => {
    // An Invalid Date reaching a comparator produces NaN, and `NaN > x` is
    // false, so a caller would silently keep whichever value it had.
    expect(toConversationTimestamp("not-a-date")).toBeNull();
    expect(toConversationTimestamp(new Date("nope"))).toBeNull();
  });
});