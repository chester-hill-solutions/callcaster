import type { AccountInstance } from "twilio/lib/rest/api/v2010/account";

export type TwilioAccountClientData = ReturnType<
  typeof projectTwilioAccountForClient
>;

export function projectTwilioAccountForClient(
  account: Pick<
    AccountInstance,
    "sid" | "friendlyName" | "status" | "type" | "dateCreated"
  >,
) {
  return {
    sid: account.sid,
    friendlyName: account.friendlyName,
    status: account.status,
    type: account.type,
    dateCreated: account.dateCreated.toISOString(),
  };
}
