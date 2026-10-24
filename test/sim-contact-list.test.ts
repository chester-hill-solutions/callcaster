import { beforeEach, expect, test, vi } from "vitest";
import { access, readFile, rm } from "node:fs/promises";

vi.mock("@playwright/test", () => ({
  expect: () => ({ toBeVisible: async () => undefined }),
}));

import { uploadSimContactList, createContactCsv } from "../e2e/sim/tasks/contact-list";
import type { SimTaskContext } from "../e2e/sim/task-context";
import type { TestInfo } from "@playwright/test";

const recipient = { name: "Ada Lovelace", phone: "+14155550123" } as const;
const attach = vi.fn(async () => undefined);
const testInfo = {
  testId: "sim-test",
  attach,
} as unknown as TestInfo;

beforeEach(() => attach.mockClear());

test("contact evidence is redacted while the private CSV keeps the upload data", async () => {
  const csvPath = await createContactCsv(testInfo, recipient);

  try {
    const csv = await readFile(csvPath, "utf8");
    const attachment = attach.mock.calls[0]?.[1] as { body: string };

    expect(csv).toContain('"Ada","Lovelace"');
    expect(csv).toContain(recipient.phone);
    expect(attachment.body).toContain("recordCount: 1");
    expect(attachment.body).toContain("phoneLast4: 0123");
    expect(attachment.body).toContain("approved-sim-recipient");
    expect(attachment.body).not.toContain(recipient.name);
    expect(attachment.body).not.toContain(recipient.phone);
  } finally {
    await rm(csvPath, { recursive: true, force: true });
  }
});

test("upload uses the unredacted private CSV and removes it after upload", async () => {
  let uploadedPath: string | undefined;
  const visible = { isVisible: async () => true, click: async () => undefined };
  const page = {
    goto: vi.fn(async () => undefined),
    getByLabel: () => ({ fill: async () => undefined }),
    getByTestId: () => ({ click: async () => undefined }),
    locator: () => ({
      setInputFiles: async (path: string) => {
        uploadedPath = path;
        expect(await readFile(path, "utf8")).toContain(recipient.phone);
      },
    }),
    getByRole: () => visible,
    getByText: () => visible,
  } as never;
  const context = {
    profile: { expectedRole: "member", capabilities: ["audience.write"] },
  } as SimTaskContext;

  await uploadSimContactList({
    page,
    testInfo,
    context,
    input: { recipient },
  });

  if (!uploadedPath) throw new Error("The CSV path was not uploaded");
  await expect(access(uploadedPath)).rejects.toThrow();
  expect(attach.mock.calls.at(-1)?.[1]).toEqual(expect.objectContaining({
    body: expect.not.stringContaining(recipient.name),
  }));
});
