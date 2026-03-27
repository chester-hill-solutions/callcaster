import { json } from "@remix-run/node";
import { parseActionRequest , requireWorkspaceAccess } from "@/lib/database.server";
import { verifyAuth } from "@/lib/supabase.server";
import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger.server";
import type { Database } from "@/lib/database.types";
import { csvResponse, toCsvString } from "@/lib/csv";
import type { CsvCell } from "@/lib/csv";

interface SupabaseResponse {
    supabaseClient: SupabaseClient<Database>;
    headers: Headers;
}

interface OtherDataItem {
    key: string;
    value: string | number | boolean;
}

interface AudienceData {
    id: number;
    [key: string]: string | number | boolean | null | undefined;
}

type AudiencesDeps = {
  verifyAuth: (request: Request) => Promise<{ supabaseClient: SupabaseResponse["supabaseClient"]; headers: Headers; user?: any }>;
  parseActionRequest: (request: Request) => Promise<Record<string, unknown>>;
  requireWorkspaceAccess: typeof requireWorkspaceAccess;
};

const resolveDeps = (deps?: Partial<AudiencesDeps>) => {
  return {
    verifyAuth: deps?.verifyAuth ?? verifyAuth,
    parseActionRequest: deps?.parseActionRequest ?? parseActionRequest,
    requireWorkspaceAccess: deps?.requireWorkspaceAccess ?? requireWorkspaceAccess,
  } as AudiencesDeps;
};

export const action = async ({ request, deps }: { request: Request; deps?: Partial<AudiencesDeps> }) => {
    const d = resolveDeps(deps);
    const { supabaseClient, headers }: SupabaseResponse =
        await d.verifyAuth(request);

    const method = request.method;

    let response: AudienceData[] | { success: boolean } | null | undefined;

    if (method === 'PATCH') {
        const raw = await d.parseActionRequest(request);
        const data: Partial<AudienceData> = {};
        for (const [key, value] of Object.entries(raw)) {
            if (key === 'id') {
                data.id = parseInt(String(value ?? ""), 10);
            } else if (value != null && typeof value !== "object") {
                data[key] = String(value);
            }
        }

        if (!data.id) {
            return json({ error: 'Missing id' }, { status: 400, headers });
        }

        const { data: update, error } = await supabaseClient
            .from('audience')
            .upsert(data as Database['public']['Tables']['audience']['Update'])
            .eq('id', data.id)
            .select();
        response = update || null;
    }
    
    if (method === "DELETE") {
        const raw = await d.parseActionRequest(request);
        const idStr = raw.id != null ? String(raw.id) : "";
        if (!idStr) {
            return json({ error: 'Missing id' }, { status: 400, headers });
        }
        const id = parseInt(idStr.toString(), 10);
        if (isNaN(id)) {
            return json({ error: 'Invalid id' }, { status: 400, headers });
        }

        const { error } = await supabaseClient
            .from('audience')
            .delete()
            .eq('id', id);
        if (error){
            logger.error("Error deleting audience:", error);
        }
        response = { success: true };
    }
    
    return json(response, { headers });
};

export const loader = async ({ request, deps }: { request: Request; deps?: Partial<AudiencesDeps> }) => {
    const d = resolveDeps(deps);
    const { supabaseClient, headers, user } = await d.verifyAuth(request);
    const url = new URL(request.url);
    const audienceId = url.searchParams.get('audienceId');
    const returnType = url.searchParams.get('returnType');
    const sortKey = url.searchParams.get("sortKey") || "id";
    const sortDirectionRaw = url.searchParams.get("sortDirection") || "asc";
    const sortDirection = sortDirectionRaw === "desc" ? "desc" : "asc";
    const q = (url.searchParams.get("q") || "").trim();

    if (returnType === 'csv') {
        if (!audienceId) {
          return json({ error: "Missing audienceId" }, { status: 400, headers });
        }

        const id = parseInt(audienceId, 10);
        if (Number.isNaN(id)) {
          return json({ error: "Invalid audienceId" }, { status: 400, headers });
        }

        // Defense-in-depth: verify the audience belongs to a workspace the user can access.
        const { data: audienceRow, error: audienceError } = await supabaseClient
          .from("audience")
          .select("workspace")
          .eq("id", id)
          .single();
        if (audienceError || !audienceRow?.workspace) {
          return json({ error: "Audience not found" }, { status: 404, headers });
        }
        await d.requireWorkspaceAccess({
          supabaseClient,
          user,
          workspaceId: audienceRow.workspace,
        });

        let query = supabaseClient
          .from('contact_audience')
          .select(`*,...contact!inner(*)`)
          .eq('audience_id', id);

        // Search parity: mirror UI's search over contact fields.
        if (q) {
          const pattern = `%${q}%`;
          query = query.or(
            [
              `contact.firstname.ilike.${pattern}`,
              `contact.surname.ilike.${pattern}`,
              `contact.email.ilike.${pattern}`,
              `contact.phone.ilike.${pattern}`,
            ].join(","),
          );
        }

        // Sorting parity: mirror UI ordering by embedded contact fields when applicable.
        const allowedContactSortKeys = new Set([
          "id",
          "firstname",
          "surname",
          "phone",
          "email",
          "address",
          "city",
          "province",
          "postal",
          "country",
          "created_at",
        ]);
        if (allowedContactSortKeys.has(sortKey)) {
          query = query.order(`contact(${sortKey})`, {
            ascending: sortDirection === "asc",
          });
        }

        const { data: rawData, error } = await query;
        if (error) {
            logger.error("Error fetching contact audience data:", error);
            throw error;
        }

        // Process the raw data to flatten nested objects
        const processedData = rawData?.map((row) => {
            const flatRow: Record<string, unknown> = { ...row };
            if (row.other_data && Array.isArray(row.other_data) && row.other_data.length > 0) {
                const otherData = row.other_data as unknown as OtherDataItem[];
                otherData.forEach((item) => {
                    if (item && typeof item === 'object' && 'key' in item && 'value' in item) {
                        flatRow[item.key] = item.value;
                    }
                });
            }
            delete flatRow.other_data;
            return flatRow;
        });

        // Deterministic headers: stable ordering across runs.
        const firstProcessedRow =
          processedData && processedData.length > 0 ? processedData[0] : undefined;
        const rowHeaders = firstProcessedRow ? Object.keys(firstProcessedRow).sort() : [];

        const csvString = toCsvString({
          headers: rowHeaders,
          rows: (processedData ?? []) as Array<Record<string, CsvCell>>,
        });
        
        const filename = `audience_${audienceId}.csv`;
        
        return csvResponse({
          filename,
          csv: csvString,
          headers: Object.fromEntries(headers.entries()),
        });
    }
    // Handle regular JSON response
    const query = supabaseClient.from('contact_audience').select(`*,...contact!inner(*)`);
    if (audienceId) {
        const id = parseInt(audienceId, 10);
        if (!isNaN(id)) {
            query.eq('audience_id', id);
        }
    }

    const { data, error } = await query;
    if (error) {
        logger.error("Error fetching contact audience data:", error);
        throw error;
    }

    return json({ data }, { headers });
};