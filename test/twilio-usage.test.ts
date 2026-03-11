import { describe, expect, test } from "vitest";

import { getTwilioUsageDateRange, groupTwilioUsageData } from "../app/lib/twilio-usage";

describe("app/lib/twilio-usage.ts", () => {
  test("suppresses parent usage categories when detailed child categories exist", () => {
    const { groupedUsage, totalPrice } = groupTwilioUsageData([
      {
        category: "sms",
        description: "All SMS messages",
        usage: "15",
        usageUnit: "messages",
        price: "1.50",
      },
      {
        category: "sms-inbound",
        description: "Inbound SMS",
        usage: "5",
        usageUnit: "messages",
        price: "0.20",
      },
      {
        category: "sms-outbound",
        description: "Outbound SMS",
        usage: "10",
        usageUnit: "messages",
        price: "1.30",
      },
      {
        category: "totalprice",
        description: "Total price",
        usage: "1.50",
        usageUnit: "usd",
        price: "1.50",
      },
    ]);

    expect(groupedUsage.SMS).toEqual({
      usage: 15,
      price: 1.5,
      details: [
        {
          description: "Inbound SMS",
          usage: "5",
          usageUnit: "messages",
          price: "0.20",
        },
        {
          description: "Outbound SMS",
          usage: "10",
          usageUnit: "messages",
          price: "1.30",
        },
      ],
    });
    expect(totalPrice).toBe(1.5);
    expect(groupedUsage.Other).toBeUndefined();
  });

  test("keeps summary categories when only separate carrier fees are present", () => {
    const { groupedUsage, totalPrice } = groupTwilioUsageData([
      {
        category: "sms",
        description: "All SMS messages",
        usage: "20",
        usageUnit: "messages",
        price: "2.00",
      },
      {
        category: "sms-messages-carrierfees",
        description: "Carrier fees",
        usage: "20",
        usageUnit: "messages",
        price: "0.40",
      },
    ]);

    expect(groupedUsage.SMS?.price).toBe(2);
    expect(groupedUsage["Carrier Fees"]?.price).toBe(0.4);
    expect(totalPrice).toBe(2.4);
  });

  test("suppresses intermediate rollups when more specific descendants exist", () => {
    const { groupedUsage, totalPrice } = groupTwilioUsageData([
      {
        category: "sms-inbound",
        description: "Inbound SMS",
        usage: "56",
        usageUnit: "segments",
        price: "0.46",
      },
      {
        category: "sms-inbound-longcode",
        description: "Standard Inbound SMS",
        usage: "56",
        usageUnit: "segments",
        price: "0.46",
      },
      {
        category: "sms-outbound",
        description: "Outbound SMS",
        usage: "21392",
        usageUnit: "segments",
        price: "177.55",
      },
      {
        category: "sms-outbound-longcode",
        description: "Standard Outbound SMS",
        usage: "21392",
        usageUnit: "segments",
        price: "177.55",
      },
    ]);

    expect(groupedUsage.SMS).toEqual({
      usage: 21448,
      price: 178.01,
      details: [
        {
          description: "Standard Inbound SMS",
          usage: "56",
          usageUnit: "segments",
          price: "0.46",
        },
        {
          description: "Standard Outbound SMS",
          usage: "21392",
          usageUnit: "segments",
          price: "177.55",
        },
      ],
    });
    expect(totalPrice).toBe(178.01);
  });

  test("keeps phone number setup fees separate from number inventory", () => {
    const { groupedUsage, totalPrice } = groupTwilioUsageData([
      {
        category: "phonenumbers",
        description: "Phone Numbers",
        usage: "2",
        usageUnit: "numbers",
        price: "2.30",
      },
      {
        category: "phonenumbers-setups",
        description: "Phone Number Setup",
        usage: "1",
        usageUnit: "number-setups",
        price: "0",
      },
    ]);

    expect(groupedUsage["Phone Numbers"]).toEqual({
      usage: 3,
      price: 2.3,
      details: [
        {
          description: "Phone Numbers",
          usage: "2",
          usageUnit: "numbers",
          price: "2.30",
        },
        {
          description: "Phone Number Setup",
          usage: "1",
          usageUnit: "number-setups",
          price: "0",
        },
      ],
    });
    expect(totalPrice).toBe(2.3);
  });

  test("maps bundle sms to SMS and channels to a dedicated bucket", () => {
    const { groupedUsage, totalPrice } = groupTwilioUsageData([
      {
        category: "bundle-sms-us",
        description: "Bundle - SMS Bucket - All US SMS",
        usage: "1504",
        usageUnit: "messages",
        price: "12.48",
      },
      {
        category: "channels-messaging-outbound",
        description: "Channels",
        usage: "33694",
        usageUnit: "messages",
        price: "273.50",
      },
    ]);

    expect(groupedUsage.SMS).toEqual({
      usage: 1504,
      price: 12.48,
      details: [
        {
          description: "Bundle - SMS Bucket - All US SMS",
          usage: "1504",
          usageUnit: "messages",
          price: "12.48",
        },
      ],
    });
    expect(groupedUsage.Channels).toEqual({
      usage: 33694,
      price: 273.5,
      details: [
        {
          description: "Channels",
          usage: "33694",
          usageUnit: "messages",
          price: "273.50",
        },
      ],
    });
    expect(groupedUsage.Other).toBeUndefined();
    expect(totalPrice).toBe(285.98);
  });

  test("builds a stable UTC date range for the last 30 days", () => {
    expect(getTwilioUsageDateRange(new Date("2026-03-06T12:00:00.000Z"))).toEqual({
      startDate: "2026-02-04",
      endDate: "2026-03-06",
    });
  });
});
