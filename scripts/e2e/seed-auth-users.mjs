#!/usr/bin/env node
/* eslint-env node */
/**
 * Seed Better Auth credential rows for E2E users.
 * Called from seed-database.mjs after profile rows exist.
 */
import { hashPassword } from "better-auth/crypto";

/**
 * @param {import('postgres').Sql} sql
 * @param {{ id: string; email: string; first: string; last: string }} user
 * @param {string} password
 */
export async function seedAuthUser(sql, user, password) {
  const now = new Date().toISOString();
  const displayName = [user.first, user.last].filter(Boolean).join(" ").trim() || user.email;
  const passwordHash = await hashPassword(password);

  // Legacy Supabase auth.users (must precede public.user when insert_new_user trigger exists).
  try {
    await sql`
      INSERT INTO auth.users (id, email)
      VALUES (${user.id}::uuid, ${user.email})
      ON CONFLICT (id) DO NOTHING
    `;
  } catch {
    // auth schema absent on fully migrated databases.
  }

  await sql`
    INSERT INTO auth_user (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
    VALUES (${user.id}, ${displayName}, ${user.email}, ${true}, ${false}, ${now}, ${now})
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      email_verified = EXCLUDED.email_verified,
      updated_at = EXCLUDED.updated_at
  `;

  const accountId = `${user.id}:credential`;

  await sql`
    INSERT INTO auth_account (
      id, account_id, provider_id, user_id, password, created_at, updated_at
    )
    VALUES (
      ${accountId},
      ${user.id},
      ${"credential"},
      ${user.id},
      ${passwordHash},
      ${now},
      ${now}
    )
    ON CONFLICT (id) DO UPDATE SET
      password = EXCLUDED.password,
      updated_at = EXCLUDED.updated_at
  `;
}
