import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { setDualAuthSession } from "./helpers/route-auth-mock";

vi.mock("@/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

const requireWorkspaceAccess = vi.fn(async () => undefined);

const audienceExportMocks = vi.hoisted(() => ({
  findAudienceWorkspaceById: vi.fn(async () => "w1"),
  listAudienceContactsForExport: vi.fn(async () => [
    {
      id: 1,
      firstname: "=1+1",
      surname: 'Doe, "Jr"',
      opt_out: false,
      other_data: [{ key: "custom", value: "@SUM(1,1)" }],
    },
  ]),
}));

vi.mock("@/lib/database.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/database.server")>(
    "@/lib/database.server",
  );
  return { ...actual, requireWorkspaceAccess };
});

vi.mock("@/lib/audience-upload-db.server", () => ({
  findAudienceWorkspaceById: (...args: any[]) =>
    audienceExportMocks.findAudienceWorkspaceById(...args),
}));

vi.mock("@/lib/database/contact-audience.server", () => ({
  listAudienceContactsForExport: (...args: any[]) =>
    audienceExportMocks.listAudienceContactsForExport(...args),
}));

vi.mock("@/lib/auth.server", () => ({
  getSession: () => ({ headers: new Headers(),
  }),
}));

describe("api.audiences CSV export contract", () => {
  beforeEach(() => {
    requireWorkspaceAccess.mockClear();
    audienceExportMocks.findAudienceWorkspaceById.mockReset();
    audienceExportMocks.listAudienceContactsForExport.mockReset();
    audienceExportMocks.findAudienceWorkspaceById.mockResolvedValue("w1");
    audienceExportMocks.listAudienceContactsForExport.mockResolvedValue([
      {
        id: 1,
        firstname: "=1+1",
        surname: 'Doe, "Jr"',
        opt_out: false,
        other_data: [{ key: "custom", value: "@SUM(1,1)" }],
      },
    ]);
    setDualAuthSession({
            headers: new Headers(),
      user: { id: "u1" },
    });
  });

  test("returns BOM + CRLF CSV with no-store headers and enforces workspace access", async () => {
    const mod = await import("../app/routes/api+/audiences");
    const request = new Request(
      "http://localhost/api/audiences?returnType=csv&audienceId=123&q=doe&sortKey=firstname&sortDirection=desc",
    );
    const res = await asRouteResponse(await mod.loader({ request } as any));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Disposition")).toContain("attachment;");

    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const csv = new TextDecoder("utf-8").decode(bytes);
    expect(csv).toContain("\r\n");
    expect(csv).toContain("'\u003d1+1");
    expect(csv).toContain("'@SUM(1,1)");

    expect(requireWorkspaceAccess).toHaveBeenCalledTimes(1);
    expect(requireWorkspaceAccess).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "w1" }),
    );
  });

  test("applies search + contact-field sort and produces deterministic headers", async () => {
    const mod = await import("../app/routes/api+/audiences");
    const request = new Request(
      "http://localhost/api/audiences?returnType=csv&audienceId=123&q=doe&sortKey=firstname&sortDirection=desc",
    );
    const res = await asRouteResponse(await mod.loader({ request } as any));
    expect(res.status).toBe(200);

    const bytes = new Uint8Array(await res.arrayBuffer());
    const csv = new TextDecoder("utf-8").decode(bytes);
    const headerLine = csv.split("\r\n")[0].replace(/^\uFEFF/, "");
    expect(headerLine.split(",")).toEqual([
      "custom",
      "firstname",
      "id",
      "opt_out",
      "surname",
    ]);

    expect(audienceExportMocks.listAudienceContactsForExport).toHaveBeenCalledWith(
      "w1",
      123,
      expect.objectContaining({
        q: "doe",
        sortKey: "firstname",
        sortDirection: "desc",
      }),
    );
  });
});
