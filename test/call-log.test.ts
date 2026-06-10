import { describe, expect, it } from "vitest";

import {
  buildCallLogSearchParams,
  formatCallLogAgentName,
  isInboundDirection,
  parseCallLogSearchParams,
  resolveCallLogParties,
} from "../shared/call-log";

describe("call-log helpers", () => {
  it("parses default search params", () => {
    const state = parseCallLogSearchParams(new URLSearchParams());
    expect(state.sortKey).toBe("date_created");
    expect(state.sortDirection).toBe("desc");
    expect(state.direction).toBe("all");
    expect(state.page).toBe(1);
    expect(state.pageSize).toBe(25);
  });

  it("round-trips filters and sorting through URL params", () => {
    const params = buildCallLogSearchParams({
      callcasterNumber: "+15551234567",
      otherNumber: "+15559876543",
      direction: "inbound",
      disposition: "No Answer",
      agentUserId: "user-1",
      sortKey: "disposition",
      sortDirection: "asc",
      page: 2,
      pageSize: 50,
    });

    const parsed = parseCallLogSearchParams(params);
    expect(parsed.callcasterNumber).toBe("+15551234567");
    expect(parsed.otherNumber).toBe("+15559876543");
    expect(parsed.direction).toBe("inbound");
    expect(parsed.disposition).toBe("No Answer");
    expect(parsed.agentUserId).toBe("user-1");
    expect(parsed.sortKey).toBe("disposition");
    expect(parsed.sortDirection).toBe("asc");
    expect(parsed.page).toBe(2);
    expect(parsed.pageSize).toBe(50);
  });

  it("detects inbound directions", () => {
    expect(isInboundDirection("inbound")).toBe(true);
    expect(isInboundDirection("outbound-api")).toBe(false);
    expect(isInboundDirection(null)).toBe(false);
  });

  it("resolves call parties for inbound and outbound calls", () => {
    const workspaceNumbers = ["+15551110000"];

    expect(
      resolveCallLogParties({
        from: "+15552220000",
        to: "+15551110000",
        direction: "inbound",
        workspaceNumbers,
      }),
    ).toEqual({
      callcasterNumber: "+15551110000",
      otherNumber: "+15552220000",
      flow: "inbound",
    });

    expect(
      resolveCallLogParties({
        from: "+15551110000",
        to: "+15552220000",
        direction: "outbound-api",
        workspaceNumbers,
      }),
    ).toEqual({
      callcasterNumber: "+15551110000",
      otherNumber: "+15552220000",
      flow: "outbound",
    });
  });

  it("formats agent display names", () => {
    expect(
      formatCallLogAgentName({ username: "nate", first_name: "Nate" }),
    ).toBe("Nate (nate)");
    expect(formatCallLogAgentName({ username: "nate", first_name: null })).toBe(
      "nate",
    );
    expect(formatCallLogAgentName(null)).toBeNull();
  });
});
