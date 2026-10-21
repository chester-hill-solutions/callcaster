import Twilio from "twilio";

const SCAN_CONCURRENCY = 5;
const PAGE_SIZE = 1000;

/**
 * Every Twilio resource in the account, in one flat list.
 *
 * The parent account is scanned first, then every subaccount. A workspace is a
 * subaccount, so most workspace-owned resources only show up in the subaccount
 * scan.
 */
export async function collectResources(client, { skipSubaccounts }) {
  const resources = [];
  const accounts = client.api.v2010.accounts;

  for (const application of await client.applications.list({
    pageSize: PAGE_SIZE,
  })) {
    resources.push({
      resourceType: "twiml_app",
      sid: application.sid,
      friendlyName: application.friendlyName,
      scope: "parent",
    });
  }

  for (const service of await client.messaging.v1.services.list({
    pageSize: PAGE_SIZE,
  })) {
    resources.push({
      resourceType: "messaging_service",
      sid: service.sid,
      friendlyName: service.friendlyName,
      scope: "parent",
    });
  }

  for (const number of await client.incomingPhoneNumbers.list({
    pageSize: PAGE_SIZE,
  })) {
    resources.push({
      resourceType: "incoming_phone_number",
      sid: number.sid,
      friendlyName: number.friendlyName,
      phoneNumber: number.phoneNumber,
      scope: "parent",
    });
  }

  const subaccounts = (await accounts.list({ pageSize: PAGE_SIZE })).filter(
    (account) => account.sid !== client.accountSid,
  );

  for (const subaccount of subaccounts) {
    resources.push({
      resourceType: "subaccount",
      sid: subaccount.sid,
      friendlyName: subaccount.friendlyName,
      scope: "subaccount",
    });
  }

  if (skipSubaccounts) {
    return resources;
  }

  for (const batch of chunk(subaccounts, SCAN_CONCURRENCY)) {
    const scanned = await Promise.all(
      batch.map(async (subaccount) => {
        const sub = accounts(subaccount.sid);
        const found = [];
        for (const application of await sub.applications.list({
          pageSize: PAGE_SIZE,
        })) {
          found.push({
            resourceType: "twiml_app",
            sid: application.sid,
            friendlyName: application.friendlyName,
            scope: "subaccount",
          });
        }
        for (const service of await listSubaccountMessagingServices(
          client,
          subaccount,
        )) {
          found.push({
            resourceType: "messaging_service",
            sid: service.sid,
            friendlyName: service.friendlyName,
            scope: "subaccount",
          });
        }
        for (const number of await sub.incomingPhoneNumbers.list({
          pageSize: PAGE_SIZE,
        })) {
          found.push({
            resourceType: "incoming_phone_number",
            sid: number.sid,
            friendlyName: number.friendlyName,
            phoneNumber: number.phoneNumber,
            scope: "subaccount",
          });
        }
        return found;
      }),
    );
    for (const found of scanned) resources.push(...found);
  }

  return resources;
}

/**
 * Messaging Services use a subdomain API, which requires the subaccount's
 * own credentials. Parent credentials can only scope v2010 resources.
 */
async function listSubaccountMessagingServices(client, subaccount) {
  if (!subaccount.authToken) {
    throw new Error(
      `Cannot scan subaccount ${subaccount.sid}: no Auth Token returned`,
    );
  }
  const subClient = new Twilio.Twilio(subaccount.sid, subaccount.authToken, {
    httpClient: client.httpClient,
  });
  try {
    return await subClient.messaging.v1.services.list({ pageSize: PAGE_SIZE });
  } catch (error) {
    throw new Error(
      `Could not read Messaging Services for subaccount ${subaccount.sid} (${subaccount.status ?? "unknown status"})`,
      { cause: error },
    );
  }
}

function chunk(items, size) {
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}
