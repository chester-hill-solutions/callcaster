import { json } from "@remix-run/react";
import { verifyAuth } from "../lib/supabase.server";
import { SupabaseClient } from "@supabase/supabase-js";

interface SupabaseResponse {
    supabaseClient: SupabaseClient;
    headers: Headers;
}

interface AudienceData {
    id: string;
    [key: string]: string | number | boolean;
}

export const action = async ({ request }: { request: Request }) => {
    const { supabaseClient, headers }: SupabaseResponse =
        await verifyAuth(request);

    const method = request.method;

    let response: any;

    if (method === 'PATCH') {
        const formData = await request.formData();
        const data: AudienceData = { id: '' };
        for (let [key, value] of formData.entries()) {
            data[key] = value.toString();
        }

        const { data: update, error } = await supabaseClient
            .from('audience')
            .upsert(data)
            .eq('id', data.id)
            .select();
        response = update;
    }
    
    if (method === "DELETE") {
        const formData = await request.formData();
        const data: AudienceData = { id: '' };
        for (let [key, value] of formData.entries()) {
            data[key] = value.toString();
        }

        const { error } = await supabaseClient
            .from('audience')
            .delete()
            .eq('id', data.id);
        if (error){
            console.log(error);
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
            query.eq('audience_id', audienceId);
        }
        const { data: rawData, error } = await query;
        if (error) {
            console.error(error);
            throw error;
        }

        // Process the raw data to flatten nested objects
        const processedData = rawData?.map((row) => {
            const flatRow = { ...row };
            if (row.other_data?.length > 0) {
                row.other_data.forEach((item: any) => {
                    Object.assign(flatRow, item);
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
                const val = row[header];
                // Handle values that need escaping
                return typeof val === 'string' && val.includes(',') 
                    ? `"${val}"` 
                    : val;
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
        query.eq('audience_id', audienceId);
    }

    const { data, error } = await query;
    if (error) {
        console.error(error);
        throw error;
    }

    return json({ data }, { headers });
}