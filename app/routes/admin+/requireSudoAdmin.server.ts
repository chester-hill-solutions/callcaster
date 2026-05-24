import { redirect } from "react-router";

import type { Database } from "@/lib/database.types";
import { verifyAuth } from "@/lib/supabase.server";

type UserRow = Database["public"]["Tables"]["user"]["Row"];

export async function requireSudoAdmin(request: Request) {
    const { supabaseClient, user } = await verifyAuth(request);

    const { data: userData } = await supabaseClient
        .from("user")
        .select("*")
        .eq("id", user.id)
        .single();

    if (!userData || userData.access_level !== "sudo") {
        throw redirect("/signin");
    }

    return {
        supabaseClient,
        user,
        userData: userData as UserRow,
    };
}
