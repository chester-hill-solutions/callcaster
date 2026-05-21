import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyQueueStatusFilter,
  type QueueStatusFilter,
} from "@/lib/queue-status";

export type QueueSearchFilters = {
  name: string;
  phone: string;
  email: string;
  address: string;
  audiences: string;
  disposition: string;
  queueStatus: string;
};

export function filteredSearch(
  query: string,
  filters: QueueSearchFilters,
  supabaseClient: SupabaseClient,
  returnFields: string[] | null = null,
  campaignId: string,
) {
  let searchQuery = supabaseClient
    .from("campaign_queue")
    .select(returnFields ? returnFields.join(",") : "*", { count: "exact" })
    .eq("campaign_id", Number(campaignId));
  if (query) {
    searchQuery = searchQuery.or(`firstname.ilike.%${query}%,surname.ilike.%${query}%`, {
      foreignTable: "contact",
    });
  }
  if (filters.name) {
    searchQuery = searchQuery.or(
      `firstname.ilike.%${filters.name}%,surname.ilike.%${filters.name}%`,
      { foreignTable: "contact" },
    );
  }
  if (filters.phone) {
    searchQuery = searchQuery.ilike("contact.phone", `%${filters.phone}%`);
  }
  if (filters.disposition) {
    if (filters.disposition === "unknown") {
      searchQuery = searchQuery.is("contact.outreach_attempt.disposition", null);
    } else {
      searchQuery = searchQuery.eq(
        "contact.outreach_attempt.disposition",
        filters.disposition,
      );
    }
  }
  if (filters.queueStatus) {
    const queueStatus = filters.queueStatus as QueueStatusFilter;
    searchQuery = applyQueueStatusFilter(searchQuery, queueStatus);
  }
  if (filters.audiences) {
    const audienceId = Number(filters.audiences);
    searchQuery = searchQuery.in("contact.contact_audience.audience_id", [audienceId]);
  }
  if (filters.email) {
    searchQuery = searchQuery.ilike("contact.email", `%${filters.email}%`);
  }
  if (filters.address) {
    searchQuery = searchQuery.ilike("contact.address", `%${filters.address}%`);
  }
  return searchQuery;
}
