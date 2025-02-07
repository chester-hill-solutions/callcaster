import { ActionFunctionArgs } from "@remix-run/node";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { supabaseClient, headers, serverSession } =
        await getSupabaseServerClientWithSession(request);
    const formData = await request.formData();
    const campaign_id = formData.get("campaign_id");

    const { error } = await supabaseClient.rpc("reset_campaign", { campaign_id_prop: campaign_id });
    if (error) { console.error(error); throw error; }
    return { success: true }
}