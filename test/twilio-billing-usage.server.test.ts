import { afterEach, describe, expect, test, vi } from "vitest";
import twilio from "twilio";
import Response from "twilio/lib/http/response";
import { listTwilioBillingUsage } from "@/lib/twilio-billing-usage.server";
import { usageRecordPage } from "./helpers/twilio-usage-page";

const accountSid = "AC00000000000000000000000000000000";
const params = {
  startDate: new Date("2026-09-06"),
  endDate: new Date("2026-10-06"),
};
const total = {
  category: "totalprice",
  description: "All usage",
  usage: "4.20",
  usage_unit: "usd",
  price: "4.20",
  price_unit: "usd",
  start_date: "2026-09-06",
  end_date: "2026-10-06",
};
function response(records: readonly object[], next: string | null = null) {
  return new Response(
    200,
    JSON.stringify({ usage_records: records, next_page_uri: next }),
    {},
  );
}
afterEach(() => vi.restoreAllMocks());

describe("Twilio billing raw page boundary (#2426)", () => {
  test("requests the captured GMT window and retains totals on later SDK pages", async () => {
    const client = twilio(accountSid, "owned-fixture");
    const next = `/2010-04-01/Accounts/${accountSid}/Usage/Records.json?PageToken=owned-next`;
    const request = vi
      .spyOn(client, "request")
      .mockResolvedValueOnce(
        response(
          [{ ...total, category: "sms-outbound", usage_unit: "messages" }],
          next,
        ),
      )
      .mockResolvedValueOnce(response([total]));
    const records = await listTwilioBillingUsage(client.usage.records, params);
    expect(records).toHaveLength(2);
    expect(records[1]).toMatchObject({
      category: "totalprice",
      price: "4.20",
      priceUnit: "usd",
      startDate: "2026-09-06",
      endDate: "2026-10-06",
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      params: { StartDate: "2026-09-06", EndDate: "2026-10-06" },
    });
    expect(request.mock.calls[1]?.[0]).toMatchObject({
      uri: `https://api.twilio.com${next}`,
    });
  });
  test("keeps the admin limit and stops before fetching another page", async () => {
    const client = twilio(accountSid, "owned-fixture");
    const request = vi
      .spyOn(client, "request")
      .mockResolvedValueOnce(response([total, total, total], "/unused-next"));
    expect(
      await listTwilioBillingUsage(client.usage.records, {
        ...params,
        limit: 2,
      }),
    ).toHaveLength(2);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      params: { PageSize: 2 },
    });
  });
  test("continues through an empty SDK page with a next-page link", async () => {
    const client = twilio(accountSid, "owned-fixture");
    const request = vi
      .spyOn(client, "request")
      .mockResolvedValueOnce(response([], "/owned-next"))
      .mockResolvedValueOnce(response([total]));
    expect(
      await listTwilioBillingUsage(client.usage.records, params),
    ).toHaveLength(1);
    expect(request).toHaveBeenCalledTimes(2);
  });
  test("propagates a later-page failure rather than returning a partial cost", async () => {
    const client = twilio(accountSid, "owned-fixture");
    vi.spyOn(client, "request")
      .mockResolvedValueOnce(response([total], "/owned-next"))
      .mockRejectedValueOnce(new Error("Owned page failure"));
    await expect(
      listTwilioBillingUsage(client.usage.records, params),
    ).rejects.toThrow("Owned page failure");
  });
  test.each([
    { start: "2026-08-37", normalized: "2026-09-06T00:00:00.000Z" },
    { start: "2026-09-06garbage", normalized: "2026-09-06garbage" },
  ])(
    "retains invalid wire date $start despite actual SDK conversion",
    async ({ start, normalized }) => {
      const page = usageRecordPage([{ ...total, start_date: start }]);
      const sdkDate = page.instances[0]?.startDate;
      expect(sdkDate instanceof Date ? sdkDate.toISOString() : sdkDate).toBe(
        normalized,
      );
      const client = twilio(accountSid, "owned-fixture");
      vi.spyOn(client, "request").mockResolvedValueOnce(
        response([{ ...total, start_date: start }]),
      );
      expect(
        (await listTwilioBillingUsage(client.usage.records, params))[0]
          ?.startDate,
      ).toBe(start);
    },
  );
});
