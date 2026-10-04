import { beforeEach, describe, expect, test, vi } from "vitest";

import { processAudienceUpload } from "@/lib/audience-upload-process.server";
import { csvRow } from "@/lib/csv";

const writes = vi.hoisted(() => ({
  contacts: [] as Array<Record<string, unknown>>,
  statuses: [] as Array<Record<string, unknown>>,
  insertContacts: vi.fn(async (rows: Array<Record<string, unknown>>) => {
    writes.contacts.push(...rows);
    return rows.map((_, index) => ({ id: index + 1 }));
  }),
  updateAudience: vi.fn(async () => []),
  updateUpload: vi.fn(async () => []),
  linkContacts: vi.fn(async () => undefined),
}));

vi.mock("@/server/tenant-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/tenant-db")>()),
  createTenantDb: vi.fn(() => ({
    contact: { insertMany: writes.insertContacts },
    audience: { update: writes.updateAudience },
    audience_upload: { update: writes.updateUpload },
  })),
}));

vi.mock("@/server/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/db")>();
  return {
    ...original,
    db: {
      ...original.db,
      insert: vi.fn(() => ({ values: writes.linkContacts })),
    },
  };
});

vi.mock("@/lib/audience-upload-db.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/audience-upload-db.server")>()),
  listAudiencePhones: vi.fn(async () => new Set<string>()),
}));

vi.mock("@/lib/object-storage.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/object-storage.server")>()),
  uploadObject: vi.fn(async (_bucket: string, _path: string, body: string) => {
    writes.statuses.push(JSON.parse(body));
  }),
}));

const mapping = {
  "first name": "firstname",
  phone: "phone",
  "opt out": "opt_out",
  source: "other_data",
};

async function upload(value: string, headerMapping = mapping) {
  const csv = [
    "First Name,Phone,Opt Out,Source",
    csvRow(["Ada", "(416) 555-1234", value, "Customer CRM"]),
  ].join("\n");

  await processAudienceUpload(
    31,
    19,
    "workspace-fixture",
    "user-fixture",
    Buffer.from(csv).toString("base64"),
    headerMapping,
    null,
  );
}

function expectCompleted() {
  expect(writes.statuses.at(-1)).toMatchObject({
    status: "completed",
    progress: 100,
    skipped_invalid_contacts: 0,
    skipped_duplicate_contacts: 0,
  });
  expect(writes.updateAudience).toHaveBeenCalledWith(
    expect.objectContaining({
      set: { status: "completed", total_contacts: 1 },
    }),
  );
  expect(writes.linkContacts).toHaveBeenCalledWith([
    expect.objectContaining({ contact_id: 1, audience_id: 19 }),
  ]);
}

describe("actual audience upload opt-out mapping", () => {
  beforeEach(() => {
    writes.contacts.length = 0;
    writes.statuses.length = 0;
    vi.clearAllMocks();
  });

  test.each([
    { value: "unsubscribe", expected: true },
    { value: "opted out", expected: true },
    { value: "opted-out", expected: true },
    { value: "opted_out", expected: true },
    { value: "  UnSuBsCrIbE  ", expected: true },
    { value: "do   not\tcontact", expected: true },
    { value: "yes", expected: true },
    { value: "true", expected: true },
    { value: "1", expected: true },
    { value: "no", expected: false },
    { value: "n", expected: false },
    { value: "false", expected: false },
    { value: "0", expected: false },
    { value: "opted in", expected: false },
    { value: "opted-in", expected: false },
    { value: "subscribed", expected: false },
    { value: "active", expected: false },
    { value: "pending", expected: false },
    { value: "  NO  ", expected: false },
    { value: "", expected: false },
    { value: "   ", expected: false },
    { value: "pending review", expected: true },
    { value: "maybe", expected: true },
    { value: "definitely-not-a-consent-value", expected: true },
  ])("writes $value as boolean $expected", async ({ value, expected }) => {
    await upload(value);

    expect(writes.contacts).toHaveLength(1);
    expect(writes.contacts[0]).toMatchObject({
      firstname: "Ada",
      phone: "+14165551234",
      opt_out: expected,
      other_data: [{ Source: "Customer CRM" }],
    });
    expectCompleted();
  });

  test("an unmapped opt-out cell stays outside the contact write", async () => {
    await upload("unsubscribe", { ...mapping, "opt out": "ignore" });

    expect(writes.contacts).toHaveLength(1);
    expect(writes.contacts[0]).not.toHaveProperty("opt_out");
    expect(writes.contacts[0]).toMatchObject({
      firstname: "Ada",
      phone: "+14165551234",
      other_data: [{ Source: "Customer CRM" }],
    });
    expectCompleted();
  });
});
