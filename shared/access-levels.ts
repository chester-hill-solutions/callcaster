/**
 * Platform access levels, in the order the admin console offers them.
 *
 * `user.access_level` is a free-text column, so this list is the only
 * definition of what the API and the console may write. `standard` is the level
 * a new profile gets (`ensure-user-profile.server.ts`); `sudo` is the only level
 * that opens the admin console and the admin API (`admin-middleware.server.ts`,
 * `api-auth.server.ts`).
 */
export const ACCESS_LEVELS = ["standard", "admin", "sudo", "disabled"] as const;

export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export function isAccessLevel(value: unknown): value is AccessLevel {
  return (
    typeof value === "string" &&
    (ACCESS_LEVELS as readonly string[]).includes(value)
  );
}
