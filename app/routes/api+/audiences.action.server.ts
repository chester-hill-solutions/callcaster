import type { Database } from "@/lib/database.types";
import type { CsvCell } from "@/lib/csv";
import { data as routeData } from "react-router";
import { SupabaseClient } from "@supabase/supabase-js";
import { csvResponse, toCsvString } from "@/lib/csv";
import { data as routeData } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { parseActionRequest, requireWorkspaceAccess } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/supabase.server";

export const action = async ({ request, deps }: { request: Request; deps?: Partial<AudiencesDeps> }) => {



    const d = {
      verifyAuth: deps?.verifyAuth ?? verifyAuth,
      parseActionRequest: deps?.parseActionRequest ?? parseActionRequest,
      requireWorkspaceAccess: deps?.requireWorkspaceAccess ?? requireWorkspaceAccess,
    };
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
            return routeData({ error: 'Missing id' }, { status: 400, headers });
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
            return routeData({ error: 'Missing id' }, { status: 400, headers });
        }
        const id = parseInt(idStr.toString(), 10);
        if (isNaN(id)) {
            return routeData({ error: 'Invalid id' }, { status: 400, headers });
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
    
    return routeData(response, { headers });
}
