import type {
  RecordListInstanceOptions,
  RecordListInstancePageOptions,
} from "twilio/lib/rest/api/v2010/account/usage/record";
import twilio from "twilio";
import Response from "twilio/lib/http/response";
import { RecordPage } from "twilio/lib/rest/api/v2010/account/usage/record";

export function usageRecordPage(records: readonly object[]) {
  const client = twilio("AC00000000000000000000000000000000", "owned-fixture");
  return new RecordPage(
    client.api.v2010,
    new Response(
      200,
      JSON.stringify({ usage_records: records, next_page_uri: null }),
      {},
    ),
    { accountSid: client.accountSid },
  );
}

type UsageInstanceFixture = {
  category: string;
  description: string;
  usage: string;
  usageUnit: string;
  price?: number | string;
  priceUnit?: string;
  startDate?: Date;
  endDate?: Date;
};

export function usageRecordsClient(
  list: (params: RecordListInstanceOptions) => Promise<UsageInstanceFixture[]>,
) {
  return {
    list,
    page: async ({ pageSize, ...params }: RecordListInstancePageOptions) =>
      usageRecordPage(
        (
          await list({
            ...params,
            ...(pageSize === undefined ? {} : { limit: pageSize }),
          })
        ).map((record) => ({
          category: record.category,
          description: record.description,
          usage: record.usage,
          usage_unit: record.usageUnit,
          price: record.price,
          price_unit: record.priceUnit,
          start_date: record.startDate?.toISOString().slice(0, 10),
          end_date: record.endDate?.toISOString().slice(0, 10),
        })),
      ),
  };
}
