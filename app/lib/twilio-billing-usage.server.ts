import type {
  RecordListInstance,
  RecordListInstanceOptions,
  RecordPage,
} from "twilio/lib/rest/api/v2010/account/usage/record";
import type { TwilioUsageRecord } from "@/lib/twilio-usage";

// The SDK converts invalid calendar dates (for example August 37) to valid
// Dates. Keep the wire dates so the report can reject a malformed period.
function wireDate(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export async function listTwilioBillingUsage(
  records: Pick<RecordListInstance, "page">,
  { limit, pageSize, ...params }: RecordListInstanceOptions,
): Promise<TwilioUsageRecord[]> {
  const usage: TwilioUsageRecord[] = [];
  let pending: ReturnType<RecordPage["nextPage"]> = records.page({
    ...params,
    pageSize: pageSize ?? limit,
  });
  while (pending) {
    const page: Awaited<NonNullable<ReturnType<RecordPage["nextPage"]>>> =
      await pending;
    for (const record of page._payload.usage_records) {
      if (limit !== undefined && usage.length >= limit) return usage;
      usage.push({
        category: record.category,
        description: record.description,
        usage: record.usage,
        usageUnit: record.usage_unit,
        price:
          typeof record.price === "number" || typeof record.price === "string"
            ? String(record.price)
            : "",
        priceUnit:
          typeof record.price_unit === "string" ? record.price_unit : undefined,
        startDate: wireDate(record.start_date),
        endDate: wireDate(record.end_date),
      });
    }
    if (limit !== undefined && usage.length >= limit) return usage;
    pending = page.nextPage();
  }
  return usage;
}
