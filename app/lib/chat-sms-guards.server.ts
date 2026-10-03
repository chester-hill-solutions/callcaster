import { findSmsRecipientContacts } from "@/lib/database/contact.server";
import { getConversationPhoneKey } from "@/lib/chat-conversation-sort";
import {
  getOrLookupLineType,
  isSmsIncapableLineType,
} from "@/lib/twilio-lookup.server";
import { logger } from "@/lib/logger.server";
import type { Contact } from "@/lib/types";

export type SmsRecipientResult =
  | { ok: true; contact: Contact | null }
  | {
      ok: false;
      reason: "recipient_unverified" | "opted_out" | "sms_incapable";
      status: 400 | 403;
      body: {
        error: string;
        recipientVerificationError?: true;
        optedOut?: true;
        landline?: true;
      };
    };

function unverified(): SmsRecipientResult {
  return {
    ok: false,
    reason: "recipient_unverified",
    status: 400,
    body: {
      error:
        "Unable to verify the message recipient. Check the phone number and contact.",
      recipientVerificationError: true,
    },
  };
}

export async function verifySmsRecipient(
  workspaceId: string,
  to: string,
  contactId?: string,
  options: { checkLineType?: boolean } = {},
): Promise<SmsRecipientResult> {
  try {
    const phoneKey = getConversationPhoneKey(to);
    if (!phoneKey) return unverified();
    const suppliedId = contactId ? Number(contactId) : 0;
    if (
      contactId &&
      (!/^\d+$/.test(contactId) ||
        !Number.isSafeInteger(suppliedId) ||
        suppliedId <= 0)
    ) {
      return unverified();
    }
    const candidates = await findSmsRecipientContacts(workspaceId, to);
    const matches = candidates.filter(
      (contact) => getConversationPhoneKey(contact.phone) === phoneKey,
    );
    if (matches.length > 1) return unverified();
    const contact = matches[0] ?? null;
    if (contactId && contact?.id !== suppliedId) return unverified();
    if (!contact) return { ok: true, contact: null };
    if (contact.opt_out) {
      return {
        ok: false,
        reason: "opted_out",
        status: 403,
        body: {
          error: "This contact has opted out of messages.",
          optedOut: true,
        },
      };
    }
    if (options.checkLineType !== false) {
      const lineType =
        contact.line_type ||
        (await getOrLookupLineType({
          workspaceId,
          contactId: contact.id,
          phone: to,
          throwOnError: true,
        }));
      if (isSmsIncapableLineType(lineType)) {
        return {
          ok: false,
          reason: "sms_incapable",
          status: 400,
          body: {
            error: "This number is a landline and can't receive SMS.",
            landline: true,
          },
        };
      }
    }
    return { ok: true, contact };
  } catch (error) {
    logger.error("Error verifying SMS recipient:", error);
    return unverified();
  }
}
