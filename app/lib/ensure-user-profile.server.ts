import { user as userTable } from "@/db/schema";
import { adminDb } from "@/server/admin-db";

type AuthUserLike = {
  id: string;
  email?: string | null;
  name?: string | null;
};

function splitName(name: string | null | undefined): {
  first_name: string;
  last_name: string;
} {
  if (!name?.trim()) {
    return { first_name: "", last_name: "" };
  }
  const parts = name.trim().split(/\s+/);
  return {
    first_name: parts[0] ?? "",
    last_name: parts.length > 1 ? parts.slice(1).join(" ") : "",
  };
}

/**
 * Ensure a domain `public.user` profile exists for a Better Auth identity.
 *
 * Better Auth only writes `auth_user`. Domain FKs (`workspace_users.user_id`,
 * etc.) reference `public.user`, so signup must mirror the identity into a
 * profile row (ADR-0010 `ensureProfileForUser`).
 */
export async function ensureProfileForUser(authUser: AuthUserLike): Promise<void> {
  const email = authUser.email?.trim().toLowerCase() ?? "";
  const { first_name, last_name } = splitName(authUser.name);

  await adminDb
    .insert(userTable)
    .values({
      id: authUser.id,
      username: email || authUser.id,
      first_name,
      last_name,
      access_level: "standard",
      // DB column has DEFAULT now(); Drizzle's text typing still wants a value.
      created_at: new Date().toISOString(),
    })
    .onConflictDoNothing({ target: userTable.id });
}
