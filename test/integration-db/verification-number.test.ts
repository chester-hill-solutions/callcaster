import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("call-in verification number registry (#2519)", () => {
  let client: postgres.Sql;
  let registry: typeof import("../../app/lib/verification-number.server");

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Registry tests require a real database");
    vi.stubEnv("DATABASE_URL", databaseUrl);
    vi.stubEnv("DATABASE_DIRECT_URL", databaseUrl);
    client = postgres(databaseUrl, { max: 1 });
    registry = await import("../../app/lib/verification-number.server");
  });

  beforeEach(async () => {
    await client`delete from verification_number where phone_number like '+1555%'`;
  });

  afterAll(async () => {
    if (!client) return;
    await client`delete from verification_number where phone_number like '+1555%'`;
    await client.end({ timeout: 5 });
  });

  test("no registered number reads as no active number", async () => {
    await expect(registry.getActiveVerificationNumber()).resolves.toBeNull();
  });

  test("activating moves the single active row", async () => {
    await registry.registerVerificationNumber({ phoneNumber: "+15550000001", label: "One" });
    await registry.registerVerificationNumber({ phoneNumber: "+15550000002", label: "Two" });

    await registry.activateVerificationNumber("+15550000001");
    expect(await registry.getActiveVerificationNumber()).toBe("+15550000001");

    await registry.activateVerificationNumber("+15550000002");
    expect(await registry.getActiveVerificationNumber()).toBe("+15550000002");

    const rows = await client<{ phone_number: string; is_active: boolean }[]>`
      select phone_number, is_active from verification_number
      where phone_number like '+1555%' order by phone_number
    `;
    expect(rows.filter((row) => row.is_active)).toHaveLength(1);
  });

  test("activating an unregistered number changes nothing", async () => {
    await expect(registry.activateVerificationNumber("+15550000009")).resolves.toBe(false);
    await expect(registry.getActiveVerificationNumber()).resolves.toBeNull();
  });

  test("the database refuses a second active row", async () => {
    await registry.registerVerificationNumber({ phoneNumber: "+15550000003" });
    await registry.registerVerificationNumber({ phoneNumber: "+15550000004" });
    await registry.activateVerificationNumber("+15550000003");

    await expect(
      client`update verification_number set is_active = true where phone_number = '+15550000004'`,
    ).rejects.toThrow();
  });

  test("registering again refreshes metadata and keeps the number active", async () => {
    await registry.registerVerificationNumber({ phoneNumber: "+15550000005", label: "Old" });
    await registry.activateVerificationNumber("+15550000005");

    await registry.registerVerificationNumber({
      phoneNumber: "+15550000005",
      label: "New",
      region: "ca-central",
    });

    const [row] = await client<{ label: string; region: string; is_active: boolean }[]>`
      select label, region, is_active from verification_number where phone_number = '+15550000005'
    `;
    expect(row.label).toBe("New");
    expect(row.region).toBe("ca-central");
    expect(row.is_active).toBe(true);
  });

  test("removing a number reports whether it existed", async () => {
    await registry.registerVerificationNumber({ phoneNumber: "+15550000006" });
    await expect(registry.removeVerificationNumber("+15550000006")).resolves.toBe(true);
    await expect(registry.removeVerificationNumber("+15550000006")).resolves.toBe(false);
  });

  test("the list is active-first", async () => {
    await registry.registerVerificationNumber({ phoneNumber: "+15550000007" });
    await registry.registerVerificationNumber({ phoneNumber: "+15550000008" });
    await registry.activateVerificationNumber("+15550000008");

    const rows = await registry.listVerificationNumbers();
    expect(rows[0]?.phoneNumber).toBe("+15550000008");
    expect(rows[0]?.isActive).toBe(true);
  });
});
