import { data as routeData } from "react-router";
import { Database } from "@/lib/database.types";
import { verifyAuth } from "@/lib/supabase.server";
import type { LoaderFunctionArgs } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AudienceDetailLoaderData } from "./$audience_id.types";

export async function loader({ request, params }: LoaderFunctionArgs) {

  const { supabaseClient, headers, user } = await verifyAuth(request);

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const pageSize = parseInt(url.searchParams.get("pageSize") || "50", 10);
  const sortKey = url.searchParams.get("sortKey") || "id";
  const sortDirection = url.searchParams.get("sortDirection") === "desc" ? "desc" : "asc";
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const workspace_id = params.id;
  const audience_id = params.audience_id;

  if (!audience_id) {
    return routeData<AudienceDetailLoaderData>(
      {
        contacts: null,
        workspace_id,
        audience: null,
        audience_id,
        error: "Audience ID is required",
        pagination: {
          currentPage: page,
          pageSize,
          totalCount: null
        },
        sorting: {
          sortKey,
          sortDirection
        }
      },
      { headers }
    );
  }

  // Build a simpler query that should work with sorting
  let query = supabaseClient
    .from("contact_audience")
    .select("...contact!inner(*)", { count: 'exact' })
    .eq("audience_id", parseInt(audience_id));
  
  if (sortKey) {
    query = query.order(`contact(${sortKey})`, { ascending: sortDirection === 'asc' });
  }
  
  const { data: contacts, error: contactError, count } = await query.range(from, to);

  const { data: audience, error: audienceError } = await supabaseClient
    .from("audience")
    .select()
    .eq("id", parseInt(audience_id))
    .single();

  // Get the latest upload for this audience
  const { data: latestUpload } = await supabaseClient
    .from("audience_upload")
    .select("*")
    .eq("audience_id", parseInt(audience_id))
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (contactError) {
    return routeData<AudienceDetailLoaderData>({
      contacts: null,
      workspace_id,
      audience: null,
      audience_id,
      error: contactError.message,
      pagination: {
        currentPage: page,
        pageSize,
        totalCount: null
      },
      sorting: {
        sortKey,
        sortDirection
      },
      latestUpload: null
    }, { headers });
  }

  return routeData<AudienceDetailLoaderData>(
    {
      contacts: contacts?.map(contact => ({ contact })) || null,
      workspace_id,
      audience,
      audience_id,
      error: null,
      pagination: {
        currentPage: page,
        pageSize,
        totalCount: count
      },
      sorting: {
        sortKey,
        sortDirection
      },
      latestUpload: latestUpload ? {
        id: latestUpload['id'],
        status: latestUpload['status'] || 'unknown',
        progress: latestUpload['processed_contacts'] && latestUpload['total_contacts'] 
          ? Math.round((latestUpload['processed_contacts'] / latestUpload['total_contacts']) * 100)
          : 0,
        total_contacts: latestUpload['total_contacts'] || 0,
        processed_contacts: latestUpload['processed_contacts'] || 0,
        error_message: latestUpload['error_message']
      } : null
    },
    { headers },
  );
}
