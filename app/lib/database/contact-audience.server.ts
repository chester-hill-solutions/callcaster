/**
 * Contact–audience relationship operations
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

/**
 * Remove a single contact from an audience
 */
export async function removeContactFromAudience(
  supabaseClient: SupabaseClient<Database>,
  contactId: number,
  audienceId: number
) {
  const { error } = await supabaseClient
    .from("contact_audience")
    .delete()
    .eq("contact_id", contactId)
    .eq("audience_id", audienceId);

  if (error) throw error;
  return { success: true };
}

/**
 * Remove multiple contacts from an audience and update audience total_contacts
 */
export async function removeContactsFromAudience(
  supabaseClient: SupabaseClient<Database>,
  audienceId: number,
  contactIds: number[]
) {
  const { error } = await supabaseClient
    .from("contact_audience")
    .delete()
    .eq("audience_id", audienceId)
    .in("contact_id", contactIds);

  if (error) throw error;

  const { count } = await supabaseClient
    .from("contact_audience")
    .select("contact_id", { count: "exact", head: true })
    .eq("audience_id", audienceId);

  const newCount = count ?? 0;

  await supabaseClient
    .from("audience")
    .update({ total_contacts: newCount })
    .eq("id", audienceId);

  return { removed_count: contactIds.length, new_total: newCount };
}
