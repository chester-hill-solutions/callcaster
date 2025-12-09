/**
 * Contact-related database functions
 */
import { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { Contact } from "../types";
import { logger } from "../logger.server";

export const findPotentialContacts = async (
  supabaseClient: SupabaseClient<Database>,
  phoneNumber: string,
  workspaceId: string,
) => {
  const fullNumber = phoneNumber.replace(/\D/g, "");
  const last10 = fullNumber.slice(-10);
  const last7 = fullNumber.slice(-7);
  const areaCode = last10.slice(0, 3);
  const data = await supabaseClient
    .from("contact")
    .select()
    .eq("workspace", workspaceId)
    .or(
      `phone.eq.${fullNumber},` +
        `phone.eq.+${fullNumber},` +
        `phone.eq.+1${fullNumber},` +
        `phone.eq.1${fullNumber},` +
        `phone.eq.(${areaCode}) ${last7},` +
        `phone.eq.(${areaCode})${last7},` +
        `phone.eq.${areaCode}-${last7},` +
        `phone.eq.${areaCode}.${last7},` +
        `phone.eq.(${areaCode}) ${last7.slice(0, 3)}-${last7.slice(3)},` +
        `phone.ilike.%${fullNumber},` +
        `phone.ilike.%+${fullNumber},` +
        `phone.ilike.%+1${fullNumber},` +
        `phone.ilike.%1${fullNumber},` +
        `phone.ilike.%(${areaCode})%${last7},` +
        `phone.ilike.%${areaCode}-%${last7},` +
        `phone.ilike.%${areaCode}.%${last7},` +
        `phone.ilike.%(${areaCode}) ${last7.slice(0, 3)}-${last7.slice(3)}%,` +
        `phone.ilike.${last10}%`,
    )
    .not("phone", "is", null)
    .neq("phone", "");
  return data;
};

export async function fetchContactData(
  supabaseClient: SupabaseClient<Database>,
  workspaceId: string,
  contact_id: number | string,
  contact_number: string,
) {
  let potentialContacts = [];
  let contact = null;
  let contactError = null;

  if (contact_number && !contact_id) {
    const { data: contacts } = await findPotentialContacts(
      supabaseClient,
      contact_number,
      workspaceId,
    );
    potentialContacts.push(...(contacts || []));
  }

  if (contact_id) {
    const { data: findContact, error: findContactError } = await supabaseClient
      .from("contact")
      .select()
      .eq("workspace", workspaceId)
      .eq("id", contact_id)
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
  Object.keys(data).forEach(
    (key) => data[key] === undefined && delete data[key],
  );
  delete data.audience_id;

  const { data: update, error } = await supabaseClient
    .from("contact")
    .update(data)
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
  contacts: Partial<Contact[]>,
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

  if (audience_insert_error) throw audience_insert_error;

  return { insert, audience_insert };
};

