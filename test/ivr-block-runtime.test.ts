import { describe, expect, test } from "vitest";

import { resolveNoInputTarget } from "../app/lib/ivr-block-runtime.server";

describe("resolveNoInputTarget", () => {
  test("no config falls through to the next step", () => {
    expect(resolveNoInputTarget(undefined, 0)).toEqual({ kind: "next" });
    expect(resolveNoInputTarget({ action: "next" }, 0)).toEqual({ kind: "next" });
  });

  test("hangup ends the call", () => {
    expect(resolveNoInputTarget({ action: "hangup" }, 3)).toEqual({
      kind: "hangup",
    });
  });

  test("replay replays under the cap and falls through at it", () => {
    expect(resolveNoInputTarget({ action: "replay" }, 0)).toEqual({
      kind: "replay",
    });
    expect(resolveNoInputTarget({ action: "replay" }, 1)).toEqual({
      kind: "replay",
    });
    expect(resolveNoInputTarget({ action: "replay" }, 2)).toEqual({
      kind: "next",
    });
    expect(resolveNoInputTarget({ action: "replay" }, 3)).toEqual({
      kind: "next",
    });
  });

  test("a custom maxReplays moves the cap", () => {
    expect(resolveNoInputTarget({ action: "replay", maxReplays: 1 }, 1)).toEqual(
      { kind: "next" },
    );
  });

  test("route targets a named block", () => {
    expect(
      resolveNoInputTarget({ action: { pageId: "p2", blockId: "b3" } }, 0),
    ).toEqual({ kind: "route", pageId: "p2", blockId: "b3" });
  });
});