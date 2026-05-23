import { data as routeData, ActionFunctionArgs, LoaderFunctionArgs, redirect, useLoaderData, useActionData, Form, Link } from "react-router";
import { data as routeData, redirect } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {

    const { supabaseClient, user } = await verifyAuth(request);

    if (!user) {
        throw redirect("/signin");
    }

    const { data: userData } = await supabaseClient
        .from("user")
        .select("*")
        .eq("id", user.id)
        .single();

    if (!userData || userData?.access_level !== 'sudo') {
        throw redirect("/signin");
    }

    const userId = params.userId;
    
    if (!userId) {
        return routeData({ error: "User ID is required" });
    }

    const formData = await request.formData();
    const action = formData.get("_action") as string;

    if (action === "update_user") {
        const firstName = formData.get("firstName") as string;
        const lastName = formData.get("lastName") as string;
        const username = formData.get("username") as string;
        const accessLevel = formData.get("accessLevel") as string;

        if (!username) {
            return routeData({ error: "Username is required" });
        }

        const { error } = await supabaseClient
            .from("user")
            .update({
                first_name: firstName || null,
                last_name: lastName || null,
                username,
                access_level: accessLevel || 'standard'
            })
            .eq("id", userId);
            
        if (error) {
            return routeData({ error: error.message });
        }

        return routeData({ success: "User updated successfully" });
    }

    return routeData({ error: "Invalid action" });
}
