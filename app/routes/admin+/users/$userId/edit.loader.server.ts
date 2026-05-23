import { data as routeData, redirect } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {

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
        throw redirect("/admin?tab=users");
    }

    // Get the user to edit
    const { data: targetUser } = await supabaseClient
        .from("user")
        .select("*")
        .eq("id", userId)
        .single();

    if (!targetUser) {
        throw redirect("/admin?tab=users");
    }

    return routeData({ 
        currentUser: userData,
        targetUser
    });
}
