/**
 * Contact-related database functions
 */
import { and, eq, ilike, inArray, isNotNull, ne, or, type SQL } from "drizzle-orm";
import { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { Contact } from "../types";
import { logger } from "../logger.server";
import { contact as contactTable, contact_audience } from "@/db/schema";
import { db } from "@/server/db";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";

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

function phoneLookupFilters(exactPhoneCandidates: string[]): SQL | undefined {
  if (exactPhoneCandidates.length === 0) {
    return undefined;
  }

  return and(
    inArray(contactTable.phone, exactPhoneCandidates),
    isNotNull(contactTable.phone),
    ne(contactTable.phone, ""),
  );
}

export const findPotentialContacts = async (
  supabaseClient: SupabaseClient<Database>,
  phoneNumber: string,
  workspaceId: string,
  tdb?: TenantDb,
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

  const tenantDb = tdb ?? createTenantDb(workspaceId);
  const exactPhoneCandidates = buildExactPhoneCandidates(fullNumber);
  const exactFilter = phoneLookupFilters(exactPhoneCandidates);

  if (!exactFilter) {
    return { data: [], error: null };
  }

  try {
    const exactMatches = await tenantDb.contact.findMany({ where: exactFilter });
    if (exactMatches.length > 0) {
      return { data: exactMatches, error: null };
    }

    const prefixCandidates = buildPrefixPhoneCandidates(fullNumber);
    const prefixFilters = prefixCandidates.map((candidate) =>
      ilike(contactTable.phone, `${candidate}%`),
    );

    if (prefixFilters.length === 0) {
      return { data: exactMatches, error: null };
    }

    const prefixMatches = await tenantDb.contact.findMany({
      where: and(or(...prefixFilters), isNotNull(contactTable.phone), ne(contactTable.phone, "")),
    });

    return { data: prefixMatches, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
};

export async function fetchContactData(
  supabaseClient: SupabaseClient<Database>,
  workspaceId: string,
  contact_id: number | string | null | undefined,
  contact_number: string,
  tdb?: TenantDb,
) {
  const tenantDb = tdb ?? createTenantDb(workspaceId);
  const potentialContacts: Contact[] = [];
  let contact: Contact | null = null;
  let contactError: unknown = null;

  if (contact_number && !contact_id) {
    const { data: contacts } = await findPotentialContacts(
      supabaseClient,
      contact_number,
      workspaceId,
      tenantDb,
    );
    const dedupedContacts = dedupeContactsById((contacts || []) as Contact[]);

    if (dedupedContacts.length === 1) {
      contact = dedupedContacts[0] ?? null;
    } else if (dedupedContacts.length > 1) {
      potentialContacts.push(...dedupedContacts);
    }
  }

  if (contact_id) {
    try {
      contact = (await tenantDb.contact.findFirst({
        where: eq(contactTable.id, Number(contact_id)),
      })) as Contact | null;
    } catch (findContactError) {
      contactError = findContactError;
    }
  }

  return { contact, potentialContacts, contactError };
}

export const updateContact = async (
  workspaceId: string,
  data: Partial<Contact>,
  tdb?: TenantDb,
  /** @deprecated ignored — pass workspaceId */
  supabaseClient?: SupabaseClient<Database>,
) => {
  if (!data.id) {
    throw new Error("Contact ID is required");
  }

  const tenantDb = tdb ?? createTenantDb(workspaceId);
  const sanitizedData = Object.fromEntries(
    Object.entries(data).filter(
      ([key, value]) => key !== "audience_id" && value !== undefined,
    ),
  ) as Partial<Contact>;

  const [updated] = await tenantDb.contact.update({
    set: sanitizedData,
    where: eq(contactTable.id, data.id),
  });

  if (!updated) {
    throw new Error("Contact not found");
  }

  return updated;
};

export const createContact = async (
  contactData: Partial<Contact>,
  audience_id: string,
  user_id: string,
  opts?: {
    tdb?: TenantDb;
    /** @deprecated ignored */
    supabaseClient?: SupabaseClient;
  },
) => {
  if (!contactData.workspace) {
    throw new Error("Workspace is required");
  }

  const tenantDb = opts?.tdb ?? createTenantDb(contactData.workspace);
  const { workspace, firstname, surname, phone, email, address } = contactData;

  const [inserted] = await tenantDb.contact.insert({
    firstname,
    surname,
    phone,
    email,
    address,
    created_by: user_id,
  });

  if (audience_id && inserted) {
    await db.insert(contact_audience).values({
      contact_id: inserted.id,
      audience_id: Number(audience_id),
    });
  }

  return [inserted];
};

export const bulkCreateContacts = async (
  contacts: Partial<Contact>[],
  workspace_id: string,
  audience_id: string,
  user_id: string,
  opts?: {
    tdb?: TenantDb;
    /** @deprecated ignored */
    supabaseClient?: SupabaseClient;
  },
) => {
  const tenantDb = opts?.tdb ?? createTenantDb(workspace_id);
  const contactsWithWorkspace = contacts.map((contact) => ({
    ...contact,
    workspace: workspace_id,
    created_by: user_id,
  }));

  const insert = await tenantDb.contact.insertMany(contactsWithWorkspace);

  const audienceMap = insert.map((row) => ({
    contact_id: row.id,
    audience_id: Number(audience_id),
  }));

  try {
    const audience_insert =
      audienceMap.length > 0 ? await db.insert(contact_audience).values(audienceMap).returning() : [];

    return { insert, audience_insert };
  } catch (audience_insert_error) {
    const insertedIds = insert.map((row) => row.id);
    if (insertedIds.length > 0) {
      try {
        await tenantDb.contact.delete({
          where: inArray(contactTable.id, insertedIds),
        });
      } catch (rollbackError) {
        logger.error("Failed to roll back contacts after audience insert failure", {
          workspace_id,
          insertedIds,
          rollbackError,
          originalError: audience_insert_error,
        });
      }
    }

    throw audience_insert_error;
  }
};
