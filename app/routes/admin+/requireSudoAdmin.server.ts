import { redirect } from "react-router";

import type { Database } from "@/lib/db-types";
import { verifyAuth } from "@/lib/auth.server";
import { getUserById } from "@/lib/workspace-members-db.server";

type UserRow = Database["public"]["Tables"]["user"]["Row"];

export async function requireSudoAdmin(request: Request) {
  const { user } = await verifyAuth(request);
  const userData = await getUserById(user.id);

  if (!userData || userData.access_level !== "sudo") {
    throw redirect("/signin");
  }

  return {
    user,
    userData: userData as UserRow,
  };
}
