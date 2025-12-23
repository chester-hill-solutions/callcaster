// Twilio not used in this endpoint
import { createClient } from '@supabase/supabase-js';
import type { ActionFunctionArgs } from "@remix-run/node";

// unused types removed

interface UpdateWorkspaceParams {
  workspace_id: string;
  update: WorkspaceUpdate;
}

interface WorkspaceRequest {
  workspace_id: string;
}

interface WorkspaceUpdate {
  name?: string;
  description?: string;
  settings?: Record<string, unknown>;
  [key: string]: unknown;
}

// removed unused createSubaccount

const updateWorkspace = async ({ workspace_id, update }: UpdateWorkspaceParams) => {
    const supabase = createClient(process.env['SUPABASE_URL'] ?? '', process.env['SUPABASE_SERVICE_KEY'] ?? '');
    const { data, error } = await supabase.from('workspace').update({ twilio_data: update }).eq('id', workspace_id).select().single();
    if (error) throw { workspace_error: error };
    return data;
}

export const action = async ({ request }: ActionFunctionArgs) => {
    const { workspace_id }: WorkspaceRequest = await request.json();
    try {
        const update: WorkspaceUpdate = {};
        const updated = await updateWorkspace({ workspace_id, update });
        return new Response(JSON.stringify({ ...updated }), {
            headers: {
                "Content-Type": "application/json"
            },
            status: 200
        })
    } catch (error) {
        console.error('Subaccount failed', error);
        return new Response(JSON.stringify({ error }), {
            headers: {
                'Content-Type': 'application/json'
            },
            status: 500
        });
    }
}