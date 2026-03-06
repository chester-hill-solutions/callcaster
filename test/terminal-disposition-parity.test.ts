import { describe, expect, test } from "vitest";
import { TERMINAL_OUTREACH_DISPOSITIONS_LIST as remixList } from "../app/lib/outreach-disposition";
import { TERMINAL_OUTREACH_DISPOSITIONS_LIST as edgeList } from "../supabase/functions/_shared/ivr-status-logic.ts";

describe("terminal outreach disposition parity", () => {
  test("Remix and edge terminal disposition lists match", () => {
    expect([...remixList].sort()).toEqual([...edgeList].sort());
  });
});

