import { describe, expect, test } from "vitest";

import {
  billingUnitsFromCallDurationSeconds,
  buildCallUpsertFromTwilioParams,
  twilioParamToUnderCase,
  twilioParamsToUnderCase,
} from "@/lib/twilio-call-status.server";

describe("twilio-call-status.server", () => {
  test("twilioParamToUnderCase converts PascalCase keys", () => {
    expect(twilioParamToUnderCase("CallSid")).toBe("call_sid");
    expect(twilioParamToUnderCase("CallDuration")).toBe("call_duration");
  });

  test("twilioParamsToUnderCase maps form params", () => {
    expect(
      twilioParamsToUnderCase({
        CallSid: "CA1",
        CallStatus: "completed",
      }),
    ).toEqual({
      call_sid: "CA1",
      call_status: "completed",
    });
  });

  test("buildCallUpsertFromTwilioParams uses max duration fields", () => {
    const row = buildCallUpsertFromTwilioParams({
      CallSid: "CA1",
      CallStatus: "completed",
      Timestamp: "2020-01-01T00:00:00Z",
      Duration: "30",
      CallDuration: "61",
    });
    expect(row.sid).toBe("CA1");
    expect(row.status).toBe("completed");
    expect(row.duration).toBe("61");
    expect(row.call_duration).toBe(61);
  });

  test("billingUnitsFromCallDurationSeconds bills staffed Option B rates", () => {
    expect(billingUnitsFromCallDurationSeconds(0)).toBe(4);
    expect(billingUnitsFromCallDurationSeconds(60)).toBe(4);
    expect(billingUnitsFromCallDurationSeconds(61)).toBe(9);
  });

  test("billingUnitsFromCallDurationSeconds bills IVR when kind is ivr", () => {
    expect(billingUnitsFromCallDurationSeconds(60, "ivr")).toBe(2);
    expect(billingUnitsFromCallDurationSeconds(61, "ivr")).toBe(5);
  });
});
