/**
 * Contact-related database functions
 */
import { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { Contact } from "../types";
import { logger } from "../logger.server";

function dedupeContactsById(contacts: Contact[]): Contact[] {
  return Array.from(
    new Map(
      contacts
        .filter((contact): contact is Contact => Boolean(contact?.id))
        .map((contact) => [contact.id, contact]),
    ).values(),
  );
}

function buildExactPhoneCandidates(fullNumber: string): string[] {
  const candidates = new Set<string>();

  if (!fullNumber) {
    return [];
  }

  candidates.add(fullNumber);
  candidates.add(`+${fullNumber}`);

  const last10 = fullNumber.slice(-10);
  if (last10.length === 10) {
    const areaCode = last10.slice(0, 3);
    const prefix = last10.slice(3, 6);
    const lineNumber = last10.slice(6);

    candidates.add(last10);
    candidates.add(`1${last10}`);
    candidates.add(`+1${last10}`);
    candidates.add(`(${areaCode}) ${prefix}${lineNumber}`);
    candidates.add(`(${areaCode})${prefix}${lineNumber}`);
    candidates.add(`(${areaCode}) ${prefix}-${lineNumber}`);
    candidates.add(`${areaCode}-${prefix}-${lineNumber}`);
    candidates.add(`${areaCode}.${prefix}.${lineNumber}`);
  }

  return Array.from(candidates).filter(Boolean);
}

function buildPrefixPhoneCandidates(fullNumber: string): string[] {
  if (!fullNumber) {
    return [];
  }

  const candidates = new Set<string>([fullNumber, `+${fullNumber}`]);
  const last10 = fullNumber.slice(-10);

  if (last10.length === 10) {
    candidates.add(last10);
    candidates.add(`1${last10}`);
    candidates.add(`+1${last10}`);
  }

  return Array.from(candidates);
}

export const findPotentialContacts = async (
  supabaseClient: SupabaseClient<Database>,
  phoneNumber: string,
  workspaceId: string,
) => {
  const fullNumber = phoneNumber.replace(/\D/g, "");
  if (!fullNumber) {
    return { data: [], error: null };
  }

  const rpcResult = await supabaseClient.rpc("find_contact_by_phone", {
    p_workspace_id: workspaceId,
    p_phone_number: phoneNumber,
  });
  if (!rpcResult.error) {
    return rpcResult;
  }

  logger.warn(
    "find_contact_by_phone RPC failed, falling back to legacy search",
    {
      workspaceId,
      message: rpcResult.error.message,
      code: (rpcResult.error as { code?: string }).code,
    },
  );

  const exactPhoneCandidates = buildExactPhoneCandidates(fullNumber);
  if (exactPhoneCandidates.length === 0) {
    return { data: [], error: null };
  }

  const exactMatchResult = await supabaseClient
    .from("contact")
    .select()
    .eq("workspace", workspaceId)
    .in("phone", exactPhoneCandidates)
    .not("phone", "is", null)
    .neq("phone", "");

  if (exactMatchResult.error || (exactMatchResult.data?.length ?? 0) > 0) {
    return exactMatchResult;
  }

  const prefixFilters = buildPrefixPhoneCandidates(fullNumber)
    .map((candidate) => `phone.ilike.${candidate}%`)
    .join(",");

  if (!prefixFilters) {
    return exactMatchResult;
  }

  return supabaseClient
    .from("contact")
    .select()
    .eq("workspace", workspaceId)
    .or(prefixFilters)
    .not("phone", "is", null)
    .neq("phone", "");
};

export async function fetchContactData(
  supabaseClient: SupabaseClient<Database>,
  workspaceId: string,
  contact_id: number | string | null | undefined,
  contact_number: string,
) {
  const potentialContacts: Contact[] = [];
  let contact: Contact | null = null;
  let contactError: unknown = null;

  if (contact_number && !contact_id) {
    const { data: contacts } = await findPotentialContacts(
      supabaseClient,
      contact_number,
      workspaceId,
    );
    const dedupedContacts = dedupeContactsById((contacts || []) as Contact[]);

    if (dedupedContacts.length === 1) {
      contact = dedupedContacts[0] ?? null;
    } else if (dedupedContacts.length > 1) {
      potentialContacts.push(...dedupedContacts);
    }
  }

  if (contact_id) {
    const { data: findContact, error: findContactError } = await supabaseClient
      .from("contact")
      .select()
      .eq("workspace", workspaceId)
      .eq("id", Number(contact_id))
      .single();

    if (findContactError) {
      contactError = findContactError;
    } else {
      contact = findContact;
    }
  }

  return { contact, potentialContacts, contactError };
}

export const updateContact = async (
  supabaseClient: SupabaseClient<Database>,
  data: Partial<Contact>,
) => {
  if (!data.id) {
    throw new Error("Contact ID is required");
  }
  const sanitizedData = Object.fromEntries(
    Object.entries(data).filter(
      ([key, value]) => key !== "audience_id" && value !== undefined,
    ),
  ) as Partial<Contact>;

  const { data: update, error } = await supabaseClient
    .from("contact")
    .update(sanitizedData)
    .eq("id", data.id)
    .select();

  if (error) throw error;
  if (!update || update.length === 0) throw new Error("Contact not found");

  return update[0];
};

export const createContact = async (
  supabaseClient: SupabaseClient,
  contactData: Partial<Contact>,
  audience_id: string,
  user_id: string,
) => {
  const { workspace, firstname, surname, phone, email, address } = contactData;
  const { data: insert, error } = await supabaseClient
    .from("contact")
    .insert({
      workspace,
      firstname,
      surname,
      phone,
      email,
      address,
      created_by: user_id,
    })
    .select();

  if (error) throw error;

  if (audience_id && insert) {
    const contactAudienceData = insert.map((contact) => ({
      contact_id: contact.id,
      audience_id,
    }));
    const { error: contactAudienceError } = await supabaseClient
      .from("contact_audience")
      .insert(contactAudienceData)
      .select();
    if (contactAudienceError) throw contactAudienceError;
  }

  return insert;
};

export const bulkCreateContacts = async (
  supabaseClient: SupabaseClient,
  contacts: Partial<Contact>[],
  workspace_id: string,
  audience_id: string,
  user_id: string,
) => {
  const contactsWithWorkspace = contacts.map((contact) => ({
    ...contact,
    workspace: workspace_id,
    created_by: user_id,
  }));

  const { data: insert, error } = await supabaseClient
    .from("contact")
    .insert(contactsWithWorkspace)
    .select();

  if (error) throw error;

  const audienceMap = insert.map((contact) => ({
    contact_id: contact.id,
    audience_id,
  }));

  const { data: audience_insert, error: audience_insert_error } =
    await supabaseClient.from("contact_audience").insert(audienceMap).select();

  if (audience_insert_error) {
    const insertedIds = insert.map((contact) => contact.id);
    if (insertedIds.length > 0) {
      const { error: rollbackError } = await supabaseClient
        .from("contact")
        .delete()
        .eq("workspace", workspace_id)
        .in("id", insertedIds);

      if (rollbackError) {
        logger.error(
          "Failed to roll back contacts after audience insert failure",
          {
            workspace_id,
            insertedIds,
            rollbackError,
            originalError: audience_insert_error,
          },
        );
      }
    }

    throw audience_insert_error;
  }

  return { insert, audience_insert };
};
