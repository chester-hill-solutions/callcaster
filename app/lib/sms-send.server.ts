import type { Database } from "@/lib/db-types";
import { createTenantDb } from "@/server/tenant-db";
import { withTwilioRetry, type TwilioClientCallOptions } from "@/lib/twilio-client.server";

type MessageInsert = Database["public"]["Tables"]["message"]["Insert"];

/**
 * Fields required to persist a sent SMS to the `message` table.
 *
 * Reconciles the field drift between the chat-SMS path (which carries
 * `date_created` + `outbound_media`) and the campaign-dispatch path (which
 * carries `campaign_id`). All non-key fields are optional so each caller only
 * supplies the fields it has.
 */
export type MessagePersistFields = {
  sid: string;
  body?: string;
  num_segments?: string;
  direction?: string;
  from?: string;
  to?: string;
  date_updated?: Date | string | null;
  price?: string | null;
  error_message?: string;
  account_sid?: string;
  uri?: string;
  num_media?: string;
  status?: string;
  messaging_service_sid?: string;
  date_sent?: Date | string | null;
  date_created?: Date | string | null;
  error_code?: number | null;
  price_unit?: string;
  api_version?: string;
  subresource_uris?: Record<string, unknown> | string;
  workspace: string;
  contact_id?: string | number | null;
  campaign_id?: string | number | null;
  outbound_media?: unknown[];
};

/**
 * Minimal structural view of a Twilio MessageInstance covering only the
 * fields that get persisted to the `message` table.
 */
export type TwilioMessageLike = {
  sid: string;
  body?: string;
  numSegments?: string;
  direction?: string;
  from?: string;
  to?: string;
  dateUpdated?: Date | string | null;
  price?: string | null;
  errorMessage?: string;
  accountSid?: string;
  uri?: string;
  numMedia?: string;
  status?: string;
  messagingServiceSid?: string;
  dateSent?: Date | string | null;
  dateCreated?: Date | string | null;
  errorCode?: number | null;
  priceUnit?: string;
  apiVersion?: string;
  subresourceUris?: Record<string, unknown> | string;
};

/**
 * Structural type for a Twilio-compatible SMS client. The `create` params
 * are typed loosely (`any`) because the Twilio SDK's
 * `MessageListInstanceCreateOptions` has required fields that make it
 * structurally incompatible with a generic `Record` under strict function
 * type checking (contravariance).
 */
export type TwilioSmsClientLike = {
  messages: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create: (params: any) => Promise<TwilioMessageLike>;
  };
};

function toDateIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function toNumberOrNull(
  value: string | number | null | undefined,
): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

/**
 * Map a Twilio MessageInstance (camelCase) to the snake_case `message` table
 * row, merged with caller-supplied extras (`workspace`, `contact_id`,
 * `campaign_id`, `date_created`, `outbound_media`, …).
 *
 * `Date` fields from the Twilio SDK are converted to ISO strings to match
 * the `message` table's text-based timestamp columns.
 */
export function twilioMessageToPersistFields(
  message: TwilioMessageLike,
  extras: Pick<MessagePersistFields, "workspace"> &
    Partial<Omit<MessagePersistFields, "sid" | "workspace">>,
): MessagePersistFields {
  return {
    sid: message.sid,
    body: message.body,
    num_segments: message.numSegments,
    direction: message.direction,
    from: message.from,
    to: message.to,
    date_updated: toDateIso(message.dateUpdated),
    price: message.price,
    error_message: message.errorMessage,
    account_sid: message.accountSid,
    uri: message.uri,
    num_media: message.numMedia,
    status: message.status,
    messaging_service_sid: message.messagingServiceSid,
    date_sent: toDateIso(message.dateSent),
    date_created: toDateIso(message.dateCreated),
    error_code: message.errorCode,
    price_unit: message.priceUnit,
    api_version: message.apiVersion,
    subresource_uris: message.subresourceUris,
    ...extras,
  };
}

function buildMessageInsert(fields: MessagePersistFields): MessageInsert {
  const row: MessageInsert = {
    sid: fields.sid,
    body: fields.body ?? null,
    num_segments: fields.num_segments ?? null,
    direction: (fields.direction as MessageInsert["direction"]) ?? null,
    from: fields.from ?? null,
    to: fields.to ?? null,
    date_updated: toDateIso(fields.date_updated),
    price: fields.price ?? null,
    error_message: fields.error_message ?? null,
    account_sid: fields.account_sid ?? null,
    uri: fields.uri ?? null,
    num_media: fields.num_media ?? null,
    status: (fields.status as MessageInsert["status"]) ?? null,
    messaging_service_sid: fields.messaging_service_sid ?? null,
    date_sent: toDateIso(fields.date_sent),
    error_code: fields.error_code ?? null,
    price_unit: fields.price_unit ?? null,
    api_version: fields.api_version ?? null,
    subresource_uris: (fields.subresource_uris as MessageInsert["subresource_uris"]) ?? null,
    workspace: fields.workspace,
  };
  if (fields.date_created != null) {
    row.date_created = toDateIso(fields.date_created);
  }
  const contactId = toNumberOrNull(fields.contact_id);
  if (contactId !== null) {
    row.contact_id = contactId;
  }
  const campaignId = toNumberOrNull(fields.campaign_id);
  if (campaignId !== null) {
    row.campaign_id = campaignId;
  }
  if (fields.outbound_media && fields.outbound_media.length > 0) {
    row.outbound_media = [...fields.outbound_media] as string[];
  }
  return row;
}

/**
 * Insert a persisted SMS record into the `message` table via tenant-db.
 *
 * Returns a Postgres-shaped `{ data, error }` tuple so existing callers can
 * compose it inside `Promise.all` without API churn.
 */
export async function persistMessageRecord(
  workspaceId: string,
  fields: MessagePersistFields,
): Promise<{ data: unknown[] | null; error: { message: string } | null }> {
  try {
    const tdb = createTenantDb(workspaceId);
    const rows = await tdb.message.insert(buildMessageInsert(fields));
    return { data: rows, error: null };
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : String(error) },
    };
  }
}

/**
 * Send an SMS via Twilio (with retry) and persist the resulting record.
 *
 * Use this for the simple single-send flow. Callers that need to fan out the
 * send alongside other parallel work (e.g. campaign dispatch creating an
 * outreach attempt in parallel) should call `twilioMessageToPersistFields` +
 * `persistMessageRecord` directly.
 */
export async function sendSmsAndPersist(args: {
  twilio: TwilioSmsClientLike;
  createParams: Record<string, unknown>;
  retryOptions: TwilioClientCallOptions;
  persistExtras: Pick<MessagePersistFields, "workspace"> &
    Partial<Omit<MessagePersistFields, "sid" | "workspace">>;
}): Promise<{
  message: TwilioMessageLike;
  result: { data: unknown[] | null; error: { message: string } | null };
}> {
  const message = await withTwilioRetry(
    () => args.twilio.messages.create(args.createParams),
    args.retryOptions,
  );
  const fields = twilioMessageToPersistFields(message, args.persistExtras);
  const result = await persistMessageRecord(args.persistExtras.workspace, fields);
  return { message, result };
}
