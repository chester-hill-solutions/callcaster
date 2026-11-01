import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import Twilio from "twilio";
import RequestClient from "twilio/lib/base/RequestClient";
import Response from "twilio/lib/http/response";
import {
  applyNameBackfillPlan,
  readNameBackfillPlan,
} from "../scripts/lib/twilio-subaccount-name-backfill.mjs";
import { parseBackfillArguments } from "../scripts/backfill-twilio-subaccount-names.mjs";
import { workspaceResourceName } from "../app/lib/twilio-resource-name";

const PARENT = "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CHILD = "ACbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const OTHER = "ACcccccccccccccccccccccccccccccccc";
const WS = "6aff2ab3-8a7a-48b2-92e6-f86ec7441ca0";
const WS2 = "baff2ab3-8a7a-48b2-92e6-f86ec7441ca0";
const NAMED = "Civic Action · 6aff2ab3";

function required<T>(value: T | undefined): T {
  if (value === undefined)
    throw new Error("Owned backfill fixture value is missing");
  return value;
}

function fixture() {
  const workspace = {
    id: WS,
    name: "Civic Action",
    account_sid: CHILD,
    archived_at: null,
    archive_supported: true,
  };
  const sources = [
    { environment: "dev", identity: "dev-database", workspaces: [workspace] },
    { environment: "qa", identity: "qa-database", workspaces: [] },
    {
      environment: "production",
      identity: "production-database",
      workspaces: [],
    },
  ];
  const accounts = new Map([
    [
      PARENT,
      {
        sid: PARENT,
        owner_account_sid: PARENT,
        friendly_name: "Main",
        status: "active",
      },
    ],
    [
      CHILD,
      {
        sid: CHILD,
        owner_account_sid: PARENT,
        friendly_name: WS,
        status: "active",
      },
    ],
  ]);
  const requests: { method: string; path: string; data: unknown }[] = [];
  const httpClient = new RequestClient();
  const request = vi
    .spyOn(httpClient, "request")
    .mockImplementation(async (options) => {
      const url = new URL(options.uri);
      requests.push({
        method: options.method.toLowerCase(),
        path: url.pathname,
        data: options.data,
      });
      if (url.pathname === "/2010-04-01/Accounts.json") {
        const all = [...accounts.values()];
        const second = url.searchParams.has("PageToken");
        return new Response(
          200,
          {
            accounts: second ? all.slice(200) : all.slice(0, 200),
            next_page_uri:
              !second && all.length > 200
                ? "/2010-04-01/Accounts.json?PageToken=next"
                : null,
          },
          {},
        );
      }
      const sid = url.pathname.match(/\/Accounts\/(AC[0-9a-f]+)\.json$/)?.[1];
      const account = sid ? accounts.get(sid) : undefined;
      if (!account)
        return new Response(404, { code: 20404, message: "Not found" }, {});
      if (options.method.toLowerCase() === "post") {
        expect(options.data).toEqual({ FriendlyName: NAMED });
        account.friendly_name = NAMED;
      }
      return new Response(200, account, {});
    });
  const client = new Twilio.Twilio(PARENT, "fixture-only-token", {
    httpClient,
  });
  const readSources = vi.fn(async () => structuredClone(sources));
  const plan = () =>
    readNameBackfillPlan({ client, readSources, environment: "dev" });
  const posts = () => requests.filter((r) => r.method === "post");
  return {
    workspace,
    sources,
    accounts,
    request,
    requests,
    client,
    readSources,
    plan,
    posts,
  };
}

describe("reviewed Twilio subaccount name backfill", () => {
  it("dry-runs through the real SDK without writes or credential output", async () => {
    const f = fixture();
    const plan = await f.plan();
    expect(plan.entries).toEqual([
      {
        workspaceId: WS,
        accountSid: CHILD,
        before: WS,
        after: NAMED,
        action: "rename",
        reason: "Legacy UUID matches its workspace",
      },
    ]);
    expect(f.posts()).toEqual([]);
    expect(JSON.stringify(plan)).not.toContain("fixture-only-token");
    expect(f.requests.map((r) => r.method)).toEqual(["get", "get"]);
  });

  it("reads the 201st account instead of truncating at the SDK list default", async () => {
    const f = fixture();
    const child = required(f.accounts.get(CHILD));
    f.accounts.delete(CHILD);
    for (let n = 1; n <= 201; n++) {
      const sid = `AC${n.toString(16).padStart(32, "0")}`;
      f.accounts.set(sid, {
        sid,
        owner_account_sid: PARENT,
        friendly_name: "Unrelated",
        status: "active",
      });
    }
    f.accounts.set(CHILD, child);
    expect((await f.plan()).entries[0].action).toBe("rename");
    expect(
      f.requests.filter((r) => r.path.endsWith("Accounts.json")),
    ).toHaveLength(2);
    expect(f.posts()).toEqual([]);
  });

  it("changes only FriendlyName, then replays the same approval without another POST", async () => {
    const f = fixture();
    const approved = await f.plan();
    const applied = vi.fn();
    const first = await applyNameBackfillPlan({
      ...f,
      approved,
      onApplied: applied,
    });
    expect(first).toEqual([
      {
        workspaceId: WS,
        accountSid: CHILD,
        before: WS,
        after: NAMED,
        action: "renamed",
      },
    ]);
    expect(f.posts()).toEqual([
      {
        method: "post",
        path: `/2010-04-01/Accounts/${CHILD}.json`,
        data: { FriendlyName: NAMED },
      },
    ]);
    expect(applied).toHaveBeenCalledTimes(1);
    expect(await applyNameBackfillPlan({ ...f, approved })).toEqual([
      { accountSid: CHILD, action: "unchanged" },
    ]);
    expect(f.posts()).toHaveLength(1);
  });

  it.each([
    [
      "a production reference",
      (f: ReturnType<typeof fixture>) =>
        f.sources[2].workspaces.push({ ...f.workspace, id: WS2 }),
    ],
    [
      "a QA reference",
      (f: ReturnType<typeof fixture>) =>
        f.sources[1].workspaces.push({ ...f.workspace, id: WS2 }),
    ],
    [
      "two workspace owners",
      (f: ReturnType<typeof fixture>) =>
        f.sources[0].workspaces.push({ ...f.workspace, id: WS2 }),
    ],
    [
      "a custom name",
      (f: ReturnType<typeof fixture>) => {
        required(f.accounts.get(CHILD)).friendly_name = "Keep this label";
      },
    ],
    [
      "another parent",
      (f: ReturnType<typeof fixture>) => {
        required(f.accounts.get(CHILD)).owner_account_sid = OTHER;
      },
    ],
    [
      "a suspended account",
      (f: ReturnType<typeof fixture>) => {
        required(f.accounts.get(CHILD)).status = "suspended";
      },
    ],
    [
      "a closed account",
      (f: ReturnType<typeof fixture>) => {
        required(f.accounts.get(CHILD)).status = "closed";
      },
    ],
    [
      "unavailable archive state",
      (f: ReturnType<typeof fixture>) => {
        f.workspace.archive_supported = false;
      },
    ],
    [
      "an archived workspace",
      (f: ReturnType<typeof fixture>) => {
        Object.assign(f.workspace, { archived_at: "2026-01-01" });
      },
    ],
    [
      "the parent account",
      (f: ReturnType<typeof fixture>) => {
        f.workspace.account_sid = PARENT;
      },
    ],
    [
      "a missing account",
      (f: ReturnType<typeof fixture>) => {
        f.accounts.delete(CHILD);
      },
    ],
    [
      "a missing SID",
      (f: ReturnType<typeof fixture>) => {
        f.workspace.account_sid = "";
      },
    ],
    [
      "a blank workspace name",
      (f: ReturnType<typeof fixture>) => {
        f.workspace.name = " \t";
      },
    ],
  ])("blocks %s before any write", async (_, change) => {
    const f = fixture();
    const approved = await f.plan();
    change(f);
    expect((await f.plan()).entries[0].action).toBe("blocked");
    await expect(applyNameBackfillPlan({ ...f, approved })).rejects.toThrow(
      "Ownership or naming changed",
    );
    expect(f.posts()).toEqual([]);
  });

  it("retains an already-correct label and accepts an upper-case legacy UUID", async () => {
    const f = fixture();
    required(f.accounts.get(CHILD)).friendly_name = NAMED;
    expect((await f.plan()).entries[0].action).toBe("unchanged");
    required(f.accounts.get(CHILD)).friendly_name = WS.toUpperCase();
    expect((await f.plan()).entries[0].action).toBe("rename");
  });

  it("detects database ownership drift after preflight and before the POST", async () => {
    const f = fixture();
    const approved = await f.plan();
    f.readSources.mockImplementation(async () => {
      if (f.readSources.mock.calls.length >= 3)
        f.sources[2].workspaces.push({ ...f.workspace });
      return structuredClone(f.sources);
    });
    await expect(applyNameBackfillPlan({ ...f, approved })).rejects.toThrow(
      "Ownership or naming changed",
    );
    expect(f.posts()).toEqual([]);
  });

  it("rejects a new workspace name or a different database binding", async () => {
    const f = fixture();
    const approved = await f.plan();
    f.workspace.name = "Renamed workspace";
    await expect(applyNameBackfillPlan({ ...f, approved })).rejects.toThrow(
      "Ownership or naming changed",
    );
    f.workspace.name = "Civic Action";
    f.sources[0].identity = "another-database";
    await expect(applyNameBackfillPlan({ ...f, approved })).rejects.toThrow(
      "bindings changed",
    );
    expect(f.posts()).toEqual([]);
  });

  it("refuses incomplete or duplicate database sources and a non-parent credential", async () => {
    const f = fixture();
    f.sources.pop();
    await expect(f.plan()).rejects.toThrow("dev, qa and production");
    f.sources.push({
      environment: "production",
      identity: "dev-database",
      workspaces: [],
    });
    await expect(f.plan()).rejects.toThrow("same database");
    f.sources[2].identity = "production-database";
    required(f.accounts.get(PARENT)).owner_account_sid = OTHER;
    await expect(f.plan()).rejects.toThrow("parent Twilio account");
    expect(f.posts()).toEqual([]);
  });

  it("does not write a forged target name or duplicate approved entry", async () => {
    const f = fixture();
    const approved = await f.plan();
    approved.entries[0].after = "Unreviewed label";
    await expect(applyNameBackfillPlan({ ...f, approved })).rejects.toThrow(
      "Ownership or naming changed",
    );
    approved.entries[0].after = NAMED;
    approved.entries.push({ ...approved.entries[0] });
    await expect(applyNameBackfillPlan({ ...f, approved })).rejects.toThrow(
      "Duplicate rename",
    );
    expect(f.posts()).toEqual([]);
  });

  it("rechecks the provider after preflight and preserves a newly set custom name", async () => {
    const f = fixture();
    const approved = await f.plan();
    const original = required(f.request.getMockImplementation());
    f.request.mockImplementation(async (options) => {
      if (
        options.method.toLowerCase() === "get" &&
        options.uri.endsWith(`/${CHILD}.json`)
      )
        required(f.accounts.get(CHILD)).friendly_name = "Operator's new label";
      return original(options);
    });
    await expect(applyNameBackfillPlan({ ...f, approved })).rejects.toThrow(
      "Ownership or naming changed",
    );
    expect(required(f.accounts.get(CHILD)).friendly_name).toBe(
      "Operator's new label",
    );
    expect(f.posts()).toEqual([]);
  });

  it("checks every approved item before writing the first one", async () => {
    const f = fixture();
    const approved = await f.plan();
    approved.entries.push({
      workspaceId: WS2,
      accountSid: OTHER,
      before: WS2,
      after: "Other · baff2ab3",
      action: "rename",
      reason: "Legacy UUID matches its workspace",
    });
    await expect(applyNameBackfillPlan({ ...f, approved })).rejects.toThrow(
      "Ownership or naming changed",
    );
    expect(f.posts()).toEqual([]);
  });

  it("stops on a failed write and reports only verified earlier changes", async () => {
    const f = fixture();
    f.sources[0].workspaces.push({
      ...f.workspace,
      id: WS2,
      name: "Other",
      account_sid: OTHER,
    });
    f.accounts.set(OTHER, {
      sid: OTHER,
      owner_account_sid: PARENT,
      friendly_name: WS2,
      status: "active",
    });
    const approved = await f.plan();
    const original = required(f.request.getMockImplementation());
    f.request.mockImplementation(async (options) => {
      if (
        options.method.toLowerCase() === "post" &&
        options.uri.endsWith(`/${OTHER}.json`)
      )
        return new Response(
          503,
          { code: 20503, message: "Owned fixture failure" },
          {},
        );
      return original(options);
    });
    const completed = vi.fn();
    await expect(
      applyNameBackfillPlan({ ...f, approved, onApplied: completed }),
    ).rejects.toThrow("Owned fixture failure");
    expect(completed.mock.calls).toEqual([
      [
        {
          workspaceId: WS,
          accountSid: CHILD,
          before: WS,
          after: NAMED,
          action: "renamed",
        },
      ],
    ]);
    expect(required(f.accounts.get(OTHER)).friendly_name).toBe(WS2);
    expect(
      f.request.mock.calls.filter(([o]) => o.method.toLowerCase() === "post"),
    ).toHaveLength(2);
  });

  it("honors the documented 64-character Account limit and retains the ID suffix", async () => {
    const f = fixture();
    f.workspace.name = "X".repeat(400);
    expect((await f.plan()).entries[0].after).toBe(
      "X".repeat(53) + " · 6aff2ab3",
    );
    expect(workspaceResourceName("😀".repeat(400), WS, 64)).toBe(
      "😀".repeat(53) + " · 6aff2ab3",
    );
  });
});

const databaseEnvironment = {
  DEV_URL: "postgres://fixture/dev",
  QA_URL: "postgres://fixture/qa",
  PROD_URL: "postgres://fixture/production",
};
const validArgs = [
  "--environment",
  "dev",
  "--database",
  "dev=DEV_URL",
  "--database",
  "qa=QA_URL",
  "--database",
  "production=PROD_URL",
];
describe("backfill command", () => {
  it("requires explicit sources and preserves a reviewed file path", () => {
    expect(
      parseBackfillArguments(
        [...validArgs, "--apply", "/tmp/plan.json"],
        databaseEnvironment,
      ),
    ).toEqual({
      environment: "dev",
      databases: [
        { environment: "dev", url: "postgres://fixture/dev" },
        { environment: "qa", url: "postgres://fixture/qa" },
        { environment: "production", url: "postgres://fixture/production" },
      ],
      apply: "/tmp/plan.json",
    });
    for (const args of [
      [],
      ["--apply"],
      [...validArgs, "--delete"],
      [...validArgs, "--environment", "production"],
      validArgs.slice(0, -2),
      [...validArgs, "--database", "dev=DEV_URL"],
    ])
      expect(() => parseBackfillArguments(args, databaseEnvironment)).toThrow();
  });
  it("shows help and rejects unknown options with no credentials or provider traffic", () => {
    const script = "scripts/backfill-twilio-subaccount-names.mjs";
    const help = spawnSync(process.execPath, [script, "--help"], {
      encoding: "utf8",
      timeout: 10000,
    });
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("dry-run by default");
    const invalid = spawnSync(process.execPath, [script, "--delete"], {
      encoding: "utf8",
      timeout: 10000,
    });
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain("see --help");
  });
});
