import { redirect } from "react-router";

import type { Database } from "@/lib/database.types";
import { verifyAuth } from "@/lib/supabase.server";
import { getUserById } from "@/lib/workspace-members-db.server";

type UserRow = Database["public"]["Tables"]["user"]["Row"];

export async function requireSudoAdmin(request: Request) {
  const { supabaseClient, user } = await verifyAuth(request);
  const userData = await getUserById(user.id);

  if (!userData || userData.access_level !== "sudo") {
    throw redirect("/signin");
  }

  return {
    supabaseClient,
    user,
    userData: userData as UserRow,
  };
}
