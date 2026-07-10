import { redirect } from "react-router";
import type { MiddlewareFunction } from "react-router";
import { getSession } from "@/lib/auth.server";
import { getUserById } from "@/lib/workspace-members-db.server";
import { adminContext } from "@/lib/route-context.server";
import type { Database } from "@/lib/db-types";

type UserRow = Database["public"]["Tables"]["user"]["Row"];

/**
 * Sudo admin session middleware for `admin+/` layout.
 * Sets `adminContext`; never writes a response body.
 */
export const adminMiddleware: MiddlewareFunction = async (
  { request, context },
  next,
) => {
  const { user, headers } = await getSession(request);
  if (!user) {
    throw redirect("/signin");
  }

  const userData = await getUserById(user.id);
  if (!userData || userData.access_level !== "sudo") {
    throw redirect("/signin");
  }

  context.set(adminContext, {
    userId: user.id,
    accessLevel: userData.access_level,
    headers,
    userData: userData as UserRow,
  });

  return next();
};
