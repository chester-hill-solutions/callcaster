import { and, asc, desc, eq, ne } from "drizzle-orm";
import { verification_number as verificationNumberTable } from "@/db/schema";
import { adminDb } from "@/server/admin-db";

/**
 * Platform call-in verification numbers (#2519).
 *
 * Global configuration, not tenant data: the agent dials a CallCaster-owned
 * number and the app matches the caller ID against a pending session. One
 * number is active today; the table holds several for later region growth.
 */
export type VerificationNumber = {
  phoneNumber: string;
  providerSid: string | null;
  label: string | null;
  region: string | null;
  isActive: boolean;
};

type VerificationNumberRow = {
  phone_number: string;
  provider_sid: string | null;
  label: string | null;
  region: string | null;
  is_active: boolean;
};

function toVerificationNumber(row: VerificationNumberRow): VerificationNumber {
  return {
    phoneNumber: row.phone_number,
    providerSid: row.provider_sid,
    label: row.label,
    region: row.region,
    isActive: row.is_active,
  };
}

/** Every registered verification number, active first. */
export async function listVerificationNumbers(): Promise<VerificationNumber[]> {
  const rows = await adminDb
    .select()
    .from(verificationNumberTable)
    .orderBy(desc(verificationNumberTable.is_active), asc(verificationNumberTable.phone_number));
  return rows.map(toVerificationNumber);
}

/**
 * The number an agent dials to verify a handset, or null when none is active.
 * A null makes the caller return the feature-unavailable response.
 */
export async function getActiveVerificationNumber(): Promise<string | null> {
  const [row] = await adminDb
    .select({ phone_number: verificationNumberTable.phone_number })
    .from(verificationNumberTable)
    .where(eq(verificationNumberTable.is_active, true))
    .limit(1);
  return row?.phone_number ?? null;
}

/** Register a number, or refresh its metadata. New numbers start inactive. */
export async function registerVerificationNumber(input: {
  phoneNumber: string;
  providerSid?: string | null;
  label?: string | null;
  region?: string | null;
}): Promise<VerificationNumber> {
  const [row] = await adminDb
    .insert(verificationNumberTable)
    .values({
      phone_number: input.phoneNumber,
      provider_sid: input.providerSid ?? null,
      label: input.label ?? null,
      region: input.region ?? null,
    })
    .onConflictDoUpdate({
      target: verificationNumberTable.phone_number,
      set: {
        provider_sid: input.providerSid ?? null,
        label: input.label ?? null,
        region: input.region ?? null,
        updated_at: new Date().toISOString(),
      },
    })
    .returning();
  if (!row) {
    throw new Error(`Failed to register verification number ${input.phoneNumber}`);
  }
  return toVerificationNumber(row);
}

/**
 * Make one number the only active one. Deactivate-then-activate runs in one
 * transaction so the partial unique index never observes two active rows.
 * Returns false when the number is not registered.
 */
export async function activateVerificationNumber(phoneNumber: string): Promise<boolean> {
  return adminDb.transaction(async (tx) => {
    const [target] = await tx
      .select({ phone_number: verificationNumberTable.phone_number })
      .from(verificationNumberTable)
      .where(eq(verificationNumberTable.phone_number, phoneNumber))
      .limit(1);
    if (!target) return false;

    await tx
      .update(verificationNumberTable)
      .set({ is_active: false, updated_at: new Date().toISOString() })
      .where(
        and(
          eq(verificationNumberTable.is_active, true),
          ne(verificationNumberTable.phone_number, phoneNumber),
        ),
      );

    await tx
      .update(verificationNumberTable)
      .set({ is_active: true, updated_at: new Date().toISOString() })
      .where(eq(verificationNumberTable.phone_number, phoneNumber));

    return true;
  });
}

/** Remove a number. Returns false when it was not registered. */
export async function removeVerificationNumber(phoneNumber: string): Promise<boolean> {
  const rows = await adminDb
    .delete(verificationNumberTable)
    .where(eq(verificationNumberTable.phone_number, phoneNumber))
    .returning({ phone_number: verificationNumberTable.phone_number });
  return rows.length > 0;
}
