import { beforeEach, describe, expect, test, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { asRouteResponse, withRouteUrl } from "./helpers/route-result";
import { withDataPlaneRouteArgs } from "./helpers/route-context-mock";
import { setDualAuthSession } from "./helpers/route-auth-mock";

const fixtures = vi.hoisted(() => ({
  memberships: new Map<string, string>(),
  objects: new Map<string, Record<string, unknown>>(),
  list: vi.fn(),
  download: vi.fn(),
  upload: vi.fn(),
  generateReport: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth.server")>();
  return {
    ...actual,
    verifyAuth: async () => ({
      user: { id: "report-reader" },
      headers: new Headers(),
    }),
  };
});

vi.mock("@/lib/campaign-ivr.server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/campaign-ivr.server")>();
  return {
    ...actual,
    listExportableCampaignsInWorkspace: async () => [],
    findCampaignExportMeta: async () => ({
      id: 22,
      title: "Private report campaign",
      type: "message",
      status: "complete",
      is_sample: false,
    }),
  };
});

vi.mock("@/lib/campaign-export.server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/campaign-export.server")>();
  return { ...actual, processCampaignSmsReportExport: fixtures.generateReport };
});

vi.mock("@/server/tenant-db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/tenant-db")>();
  return {
    ...actual,
    createTenantDb: (workspaceId: string) => ({
      workspace_member: {
        findFirst: async ({ where }: { where: SQL }) => {
          const [userId] = new PgDialect().sqlToQuery(where).params;
          const role = fixtures.memberships.get(`${workspaceId}/${userId}`);
          return role ? { role_id: role } : undefined;
        },
      },
    }),
  };
});

vi.mock("@/lib/object-storage.server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/object-storage.server")>();
  return {
    ...actual,
    listObjects: fixtures.list,
    downloadObject: fixtures.download,
    uploadObject: fixtures.upload,
  };
});

import { listWorkspaceExportsApi } from "@/lib/platform-analytics.server";
import { loader as historyLoader } from "../app/routes/api+/workspaces+/$workspaceId/exports.action.server";
import { loader as statusLoader } from "../app/routes/api+/campaign-export-status.loader.server";
import { action as createReport } from "../app/routes/api+/campaign-export.action.server";
import { loader as pageLoader } from "../app/routes/workspaces+/$id/exports.loader.server";

const WORKSPACE = "ws-report";
const OTHER_WORKSPACE = "ws-other";
const USER = "report-reader";
const roles = ["caller", "member", "admin", "owner"] as const;

function ordinaryExport() {
  return {
    status: "completed",
    campaignId: 11,
    campaignName: "Ordinary campaign",
    downloadUrl: "https://storage.invalid/ordinary.csv",
    created_at: "2026-10-14T01:00:00Z",
    progress: 100,
  };
}

function reportExport(status = "completed") {
  return {
    ...ordinaryExport(),
    exportType: "sms-report",
    campaignId: 22,
    campaignName: "Private report campaign",
    stage: "Private report stage",
    status,
    downloadUrl: "https://storage.invalid/private-report.pdf",
    downloads: [
      {
        label: "Private report CSV",
        filename: "private-report.csv",
        downloadUrl: "https://storage.invalid/private-report.csv",
      },
    ],
  };
}

async function history(
  workspaceId = WORKSPACE,
  contextWorkspace = workspaceId,
) {
  const args = await withDataPlaneRouteArgs(
    {
      request: new Request(
        `http://localhost/api/workspaces/${workspaceId}/exports`,
      ),
      params: { workspaceId },
    },
    { workspaceId: contextWorkspace, userId: USER },
  );
  return asRouteResponse(historyLoader(args as never));
}

async function status(exportId: string, workspaceId = WORKSPACE) {
  return asRouteResponse(
    statusLoader(
      withRouteUrl({
        request: new Request(
          `http://localhost/api/campaign-export-status?workspaceId=${workspaceId}&exportId=${exportId}`,
        ),
      }) as never,
    ),
  );
}

function expectNoReport(body: unknown) {
  const json = JSON.stringify(body);
  for (const secret of [
    "report-completed",
    "report-processing",
    "report-error",
    "Private report",
    "private-report",
    '"22"',
  ]) {
    expect(json).not.toContain(secret);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  fixtures.memberships.clear();
  fixtures.objects.clear();
  fixtures.objects.set(`${WORKSPACE}/ordinary.json`, ordinaryExport());
  for (const state of ["completed", "processing", "error"]) {
    fixtures.objects.set(
      `${WORKSPACE}/report-${state}.json`,
      reportExport(state),
    );
  }
  fixtures.list.mockImplementation(
    async (_bucket: string, workspaceId: string) =>
      [...fixtures.objects.keys()]
        .filter((key) => key.startsWith(`${workspaceId}/`))
        .map((key) => ({ name: key.slice(workspaceId.length + 1) })),
  );
  fixtures.download.mockImplementation(async (_bucket: string, key: string) => {
    const content = fixtures.objects.get(key);
    if (!content) throw new Error("Missing fixture");
    return Buffer.from(JSON.stringify(content));
  });
  setDualAuthSession({ user: { id: USER } });
});

describe("SMS report history authorization", () => {
  test.each(roles)(
    "%s receives only authorized entries through the service and API",
    async (role) => {
      fixtures.memberships.set(`${WORKSPACE}/${USER}`, role);
      const result = await listWorkspaceExportsApi(USER, WORKSPACE);
      const response = await history();
      expect(result.ok).toBe(true);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({ exports: result.ok ? result.exports : [] });
      const ids = body.exports.map((entry: { id: string }) => entry.id);
      if (role === "caller" || role === "member") {
        expect(ids).toEqual(["ordinary"]);
        expectNoReport(body);
      } else {
        expect(ids.sort()).toEqual([
          "ordinary",
          "report-completed",
          "report-error",
          "report-processing",
        ]);
        expect(
          body.exports.find(
            (entry: { id: string }) => entry.id === "report-completed",
          ).download_url,
        ).toBe("https://storage.invalid/private-report.pdf");
      }
      expect(
        body.exports.find((entry: { id: string }) => entry.id === "ordinary")
          .download_url,
      ).toBe("https://storage.invalid/ordinary.csv");
    },
  );

  test.each(roles)(
    "%s has the same report visibility on the history page",
    async (role) => {
      fixtures.memberships.set(`${WORKSPACE}/${USER}`, role);
      const response = await asRouteResponse(
        pageLoader(
          withRouteUrl({
            request: new Request(
              `http://localhost/workspaces/${WORKSPACE}/exports`,
            ),
            params: { id: WORKSPACE },
          }) as never,
        ),
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      if (role === "caller" || role === "member") {
        expect(body.exports.map((entry: { id: string }) => entry.id)).toEqual([
          "ordinary",
        ]);
        expectNoReport(body);
      } else {
        expect(body.exports).toHaveLength(4);
        expect(
          body.exports.find(
            (entry: { id: string }) => entry.id === "report-completed",
          ).downloads,
        ).toEqual(reportExport().downloads);
      }
    },
  );

  test("an admin in another workspace keeps the restricted role in the requested workspace", async () => {
    fixtures.memberships.set(`${WORKSPACE}/${USER}`, "caller");
    fixtures.memberships.set(`${OTHER_WORKSPACE}/${USER}`, "admin");
    const response = await history();
    expect(response.status).toBe(200);
    expectNoReport(await response.json());
  });

  test("a nonmember gets 404 before any storage access, even as owner elsewhere", async () => {
    fixtures.memberships.set(`${OTHER_WORKSPACE}/${USER}`, "owner");
    await expect(
      listWorkspaceExportsApi(USER, WORKSPACE),
    ).rejects.toMatchObject({ statusCode: 404 });
    const response = await history();
    expect(response.status).toBe(404);
    expectNoReport(await response.json());
    expect(fixtures.list).not.toHaveBeenCalled();
    expect(fixtures.download).not.toHaveBeenCalled();
  });

  test("foreign route context cannot select another workspace's history", async () => {
    fixtures.memberships.set(`${WORKSPACE}/${USER}`, "owner");
    const response = await history(WORKSPACE, OTHER_WORKSPACE);
    expect(response.status).toBe(404);
    expect(fixtures.list).not.toHaveBeenCalled();
  });
});

describe("SMS report status and private download links", () => {
  test.each(roles)(
    "%s has the same report permission on direct status reads",
    async (role) => {
      fixtures.memberships.set(`${WORKSPACE}/${USER}`, role);
      const response = await status("report-completed");
      const body = await response.json();
      if (role === "caller" || role === "member") {
        expect(response.status).toBe(403);
        expectNoReport(body);
        expect(fixtures.upload).not.toHaveBeenCalled();
      } else {
        expect(response.status).toBe(200);
        expect(body).toEqual(reportExport());
      }
    },
  );

  test.each(["caller", "member"])(
    "%s cannot read or update a pending report through the status watchdog",
    async (role) => {
      fixtures.memberships.set(`${WORKSPACE}/${USER}`, role);
      const response = await status("report-processing");
      expect(response.status).toBe(403);
      expectNoReport(await response.json());
      expect(fixtures.upload).not.toHaveBeenCalled();
    },
  );

  test.each(roles)(
    "%s can still obtain an ordinary export download link",
    async (role) => {
      fixtures.memberships.set(`${WORKSPACE}/${USER}`, role);
      const response = await status("ordinary");
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(ordinaryExport());
    },
  );

  test("an owner elsewhere cannot read report status or links in this workspace", async () => {
    fixtures.memberships.set(`${OTHER_WORKSPACE}/${USER}`, "owner");
    const response = await status("report-completed");
    expect(response.status).toBe(404);
    expectNoReport(await response.json());
    expect(fixtures.download).not.toHaveBeenCalled();
  });
});

describe("SMS report creation authorization", () => {
  test.each(roles)("%s retains the report creation role gate", async (role) => {
    fixtures.memberships.set(`${WORKSPACE}/${USER}`, role);
    const body = new FormData();
    body.set("workspaceId", WORKSPACE);
    body.set("campaignId", "22");
    body.set("exportType", "sms-report");
    const response = await asRouteResponse(
      createReport(
        withRouteUrl({
          request: new Request("http://localhost/api/campaign-export", {
            method: "POST",
            body,
          }),
        }) as never,
      ),
    );
    if (role === "caller" || role === "member") {
      expect(response.status).toBe(403);
      expectNoReport(await response.json());
      expect(fixtures.generateReport).not.toHaveBeenCalled();
    } else {
      expect(response.status).toBe(200);
      expect((await response.json()).status).toBe("started");
      expect(fixtures.generateReport).toHaveBeenCalledWith(
        22,
        WORKSPACE,
        expect.any(String),
        "Private report campaign",
      );
    }
  });
});
