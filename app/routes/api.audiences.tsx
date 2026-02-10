import { json } from "@remix-run/node";
import { parseActionRequest } from "../lib/database.server";
import { verifyAuth } from "../lib/supabase.server";
import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger.server";
import type { Database } from "@/lib/database.types";

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

export const action = async ({ request }: { request: Request }) => {
    const { supabaseClient, headers }: SupabaseResponse =
        await verifyAuth(request);

    const method = request.method;

    let response: AudienceData[] | { success: boolean } | null | undefined;

    if (method === 'PATCH') {
        const raw = await parseActionRequest(request);
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
        const raw = await parseActionRequest(request);
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

export const loader = async ({ request }: { request: Request }) => {
    const { supabaseClient, headers }: SupabaseResponse =
        await verifyAuth(request);
    const url = new URL(request.url);
    const audienceId = url.searchParams.get('audienceId');
    const returnType = url.searchParams.get('returnType');

    if (returnType === 'csv') {
        const query = supabaseClient.from('contact_audience').select(`*,...contact!inner(*)`);
        if (audienceId) {
            const id = parseInt(audienceId, 10);
            if (!isNaN(id)) {
                query.eq('audience_id', id);
            }
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

        // Get headers from first row
        const rowHeaders = processedData && processedData.length > 0 
            ? Object.keys(processedData[0])
            : [];

        // Convert to CSV
        const csvRows = [];
        csvRows.push(rowHeaders.join(','));  // Add headers row

        // Add data rows
        processedData?.forEach((row) => {
            const values = rowHeaders.map(header => {
                const val = (row as Record<string, unknown>)[header];
                // Handle values that need escaping
                if (val === null || val === undefined) {
                    return '';
                }
                const strVal = String(val);
                return strVal.includes(',') ? `"${strVal}"` : strVal;
            });
            csvRows.push(values.join(','));
        });

        const csvString = csvRows.join('\n');
        
        // Generate filename based on audience/workspace
        const filename = audienceId ? `audience_${audienceId}.csv` : 
                        'audiences.csv';
        
        // Use Response to trigger download
        return new Response(csvString, {
            headers: new Headers({
                'Content-Type': 'text/csv;charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Expires': '0',
                ...Object.fromEntries(headers.entries())
            })
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
}