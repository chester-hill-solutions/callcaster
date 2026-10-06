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
