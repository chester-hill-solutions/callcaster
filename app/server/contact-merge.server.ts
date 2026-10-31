import { createHash, randomUUID } from "node:crypto";
import { asc, eq, inArray, sql } from "drizzle-orm";
import {
  audience_import_row,
  contact,
  contact_merge_receipt,
} from "@/db/schema";
import { getConversationPhoneKey } from "@/lib/chat-conversation-sort";
import type {
  ContactMergeEffects,
  ContactMergeProfile,
  ContactMergeReview,
  ContactMergeResult,
} from "@/lib/contact-merge";
import { AppError, ErrorCode } from "@/lib/errors.server";
import { db } from "./db";
import { createTenantDb } from "./tenant-db";
import { lockWorkspaceContactIdentity } from "./contact-identity-lock.server";
import {
  lockMergeRelations,
  moveMergeRelations,
  type MergeRelations,
} from "./contact-merge-relations.server";

const MAX_MERGE_CONTACTS = 20;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function invalid(message: string): never {
  throw new AppError(message, 400, ErrorCode.INVALID_INPUT);
}

export function parseMergeContactIds(formData: FormData): number[] {
  const raw = formData.get("merge_contact_ids");
  if (typeof raw !== "string") return invalid("Select the contacts to review.");
  let values: unknown;
  try {
    values = JSON.parse(raw);
  } catch {
    return invalid("Invalid contact selection.");
  }
  if (
    !Array.isArray(values) ||
    values.length < 2 ||
    values.length > MAX_MERGE_CONTACTS
  ) {
    return invalid(`Select between 2 and ${MAX_MERGE_CONTACTS} contacts.`);
  }
  const ids: number[] = [];
  for (const value of values) {
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value <= 0
    ) {
      return invalid("Invalid contact selection.");
    }
    if (ids.includes(value)) return invalid("Select each contact only once.");
    ids.push(value);
  }
  return ids.sort((a, b) => a - b);
}

async function loadMergeContacts(
  tx: Transaction,
  workspaceId: string,
  retainedId: number,
  ids: number[],
) {
  if (!ids.includes(retainedId))
    return invalid("The retained contact must be in the review.");
  // Imports already use this workspace lock before selecting or creating contacts.
  await lockWorkspaceContactIdentity(tx, workspaceId);
  await tx.execute(sql`select id from contact where workspace = ${workspaceId}::uuid
    and ${inArray(contact.id, ids)} order by id for update`);
  const contacts = await createTenantDb(workspaceId, tx).contact.findMany({
    where: inArray(contact.id, ids),
    orderBy: [asc(contact.id)],
  });
  if (contacts.length !== ids.length)
    throw new AppError("Contact not found", 404, ErrorCode.NOT_FOUND);
  const first = contacts[0];
  if (!first) return invalid("Select contacts to review.");
  const phoneKey = getConversationPhoneKey(first.phone);
  if (
    !phoneKey ||
    contacts.some((row) => getConversationPhoneKey(row.phone) !== phoneKey)
  ) {
    return invalid(
      "Only records for the same phone number can be reviewed together.",
    );
  }
  // A shared household phone is not proof that two records are the same person (#2679).
  for (const field of ["external_id", "voter_id"] as const) {
    const identities = new Set(
      contacts.map((row) => row[field]?.trim()).filter(Boolean),
    );
    if (identities.size > 1) {
      throw new AppError(
        "These records have different external or voter IDs. Keep them separate.",
        409,
        ErrorCode.INVALID_INPUT,
      );
    }
  }
  return contacts;
}

async function countMergeEffects(
  tx: Transaction,
  workspaceId: string,
  ids: number[],
  relations: MergeRelations,
): Promise<ContactMergeEffects> {
  return {
    audiences: new Set(relations.memberships.map((row) => row.link.audience_id))
      .size,
    surveyResponses: relations.responses.length,
    queues: relations.queues.length,
    calls: relations.calls.length,
    messages: relations.messages.length,
    outreachAttempts: relations.attempts.length,
    importReceipts: await createTenantDb(
      workspaceId,
      tx,
    ).audience_import_row.count({
      where: inArray(audience_import_row.contact_id, ids),
    }),
    continuations: relations.operations.length,
  };
}

function profileConflicts(contacts: ContactMergeProfile[]): string[] {
  const fields: Array<keyof ContactMergeProfile> = [
    "firstname",
    "surname",
    "email",
    "address",
    "city",
    "province",
    "postal",
    "country",
    "external_id",
    "voter_id",
    "household_id",
    "support_level",
    "other_data",
    "line_type",
    "voter_list_source",
    "voter_list_imported_at",
    "voter_list_expires_at",
  ];
  return fields.filter(
    (field) =>
      new Set(contacts.map((row) => JSON.stringify(row[field]))).size > 1,
  );
}

function reviewVersion(
  retainedId: number,
  contacts: ContactMergeProfile[],
  effects: ContactMergeEffects,
  relations: MergeRelations,
): string {
  return createHash("sha256")
    .update(JSON.stringify({ retainedId, contacts, effects, relations }))
    .digest("hex");
}

export async function previewContactMerge(
  workspaceId: string,
  retainedId: number,
  ids: number[],
): Promise<ContactMergeReview> {
  return db.transaction(async (tx) => {
    const contacts = await loadMergeContacts(tx, workspaceId, retainedId, ids);
    const relations = await lockMergeRelations(tx, workspaceId, ids);
    const effects = await countMergeEffects(tx, workspaceId, ids, relations);
    return {
      retainedContactId: retainedId,
      contacts,
      optedOut: contacts.some((row) => row.opt_out === true),
      conflictingFields: profileConflicts(contacts),
      effects,
      version: reviewVersion(retainedId, contacts, effects, relations),
      requestId: randomUUID(),
    };
  });
}

export function parseMergeConfirmation(form: FormData) {
  const version = form.get("merge_version");
  const requestId = form.get("merge_request_id");
  if (
    form.get("confirm_same_person") !== "yes" ||
    typeof version !== "string" ||
    !/^[a-f0-9]{64}$/.test(version) ||
    typeof requestId !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      requestId,
    )
  ) {
    return invalid(
      "Review the contacts and confirm that they are the same person before merging.",
    );
  }
  return { version, requestId };
}

export async function applyContactMerge(
  workspaceId: string,
  actorId: string,
  retainedId: number,
  ids: number[],
  confirmation: { version: string; requestId: string },
): Promise<ContactMergeResult> {
  return db.transaction(async (tx) => {
    await lockWorkspaceContactIdentity(tx, workspaceId);
    const tdb = createTenantDb(workspaceId, tx);
    const previous = await tdb.contact_merge_receipt.findFirst({
      where: eq(contact_merge_receipt.id, confirmation.requestId),
    });
    if (previous) {
      if (
        previous.actor_id !== actorId ||
        previous.retained_contact_id !== retainedId ||
        previous.version !== confirmation.version ||
        JSON.stringify(
          previous.source_profiles.map((row) => row.id).sort((a, b) => a - b),
        ) !== JSON.stringify(ids)
      ) {
        throw new AppError(
          "This merge request was already used for a different review.",
          409,
          ErrorCode.INVALID_INPUT,
        );
      }
      return {
        retainedContactId: retainedId,
        mergedCount: previous.source_profiles.length - 1,
        requestId: previous.id,
      };
    }
    const contacts = await loadMergeContacts(tx, workspaceId, retainedId, ids);
    const relations = await lockMergeRelations(tx, workspaceId, ids);
    const effects = await countMergeEffects(tx, workspaceId, ids, relations);
    if (
      reviewVersion(retainedId, contacts, effects, relations) !==
      confirmation.version
    ) {
      throw new AppError(
        "These contacts changed after your review. Review them again before merging.",
        409,
        ErrorCode.INVALID_INPUT,
      );
    }
    await moveMergeRelations(tx, workspaceId, retainedId, ids, relations);
    const lineTypes = new Set(contacts.map((row) => row.line_type));
    await tdb.contact.update({
      where: eq(contact.id, retainedId),
      set: {
        opt_out: contacts.some((row) => row.opt_out === true),
        date_updated: new Date().toISOString(),
        ...(lineTypes.size > 1
          ? { line_type: null, line_type_checked_at: null }
          : {}),
      },
    });
    // Import source receipts keep their original IDs. This receipt preserves the old-to-retained mapping.
    await tdb.contact.delete({
      where: inArray(
        contact.id,
        ids.filter((id) => id !== retainedId),
      ),
    });
    await tdb.contact_merge_receipt.insert({
      id: confirmation.requestId,
      actor_id: actorId,
      retained_contact_id: retainedId,
      version: confirmation.version,
      source_profiles: contacts,
      queue_snapshot: relations.queues,
      effects,
    });
    return {
      retainedContactId: retainedId,
      mergedCount: ids.length - 1,
      requestId: confirmation.requestId,
    };
  });
}
