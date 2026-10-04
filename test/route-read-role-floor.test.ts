import { afterEach, describe, expect, test } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  checkReadRoleFloors,
  readRoleFloor,
} from "../scripts/lib/route-read-role-floor.mjs";

const imports = `
  import {defineLoader, defineAction} from "@/lib/handler.server";
  import {workspaceLoaderAuth, workspaceRouteAuth, hasMinRole} from "@/lib/workspace-route.server";
  import {MemberRole} from "@/lib/member-role";
  import {data as routeData} from "react-router";
`;

function source(name: string, body: string) {
  const isLoader = name === "loader";
  if (isLoader)
    body = body.replaceAll("hasMinRole(userRole,", "hasMinRole(userRole.role,");
  return `${imports} export const ${name} = ${name === "loader" ? "defineLoader" : "defineAction"}({
    auth: ${name === "loader" ? "workspaceLoaderAuth" : "workspaceRouteAuth"},
    handler: async ({auth}) => { const {userRole} = auth${isLoader ? ".ctx" : ""}; ${body} }
  });`;
}

const deny = `if (!hasMinRole(userRole, MemberRole.Admin)) {
  throw new Response("Forbidden", {status:403});
}`;
const action = source("action", `${deny} await saveBilling();`);
const roots: string[] = [];

function fixture(
  loader: string,
  baseline: object[] = [],
  actionSource = action,
) {
  const root = mkdtempSync(join(tmpdir(), "billing-read-floor-"));
  roots.push(root);
  for (const [relative, contents] of [
    ["app/routes/workspaces+/$id/billing.loader.server.ts", loader],
    ["app/routes/workspaces+/$id/billing.action.server.ts", actionSource],
    ["scripts/baselines/route-read-role-floor.json", JSON.stringify(baseline)],
  ]) {
    const file = join(root, relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, contents);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("sibling read/write role guard (#2137)", () => {
  test("the same Admin floor before a read passes", () => {
    expect(
      checkReadRoleFloors(
        fixture(source("loader", `${deny} await readLedger();`)),
      ).offenders,
    ).toEqual([]);
  });

  test.each([
    { name: "missing gate", body: "await readLedger();" },
    {
      name: "weaker gate",
      body: deny.replace("MemberRole.Admin", "MemberRole.Member"),
    },
    {
      name: "inverted condition",
      body: deny.replace("!hasMinRole", "hasMinRole"),
    },
    {
      name: "non-terminating notice",
      body: "if (!hasMinRole(userRole, MemberRole.Admin)) { console.warn('denied'); }",
    },
    {
      name: "successful denial status",
      body: deny.replace("status:403", "status:200"),
    },
    { name: "unused call", body: "hasMinRole(userRole, MemberRole.Admin);" },
    {
      name: "unrelated function",
      body: deny.replace("hasMinRole", "canDisplayBilling"),
    },
    {
      name: "constant allowed role",
      body: deny.replace("userRole,", "'owner',"),
    },
    { name: "comment lookalike", body: `/* ${deny} */` },
    {
      name: "shadowed role helper",
      body: `const hasMinRole = () => true; ${deny}`,
    },
    {
      name: "shadowed role enum",
      body: `const MemberRole = {Admin: 'caller'}; ${deny}`,
    },
    {
      name: "enum constant allowed role",
      body: deny.replace("userRole,", "MemberRole.Owner,"),
    },
    {
      name: "unrelated role variable",
      body: `const displayedRole = 'owner'; ${deny.replace("userRole,", "displayedRole,")}`,
    },
    {
      name: "different auth property",
      body: deny.replace("userRole,", "auth.displayedRole,"),
    },
    { name: "mutated role row", body: `userRole.role = 'owner'; ${deny}` },
    {
      name: "string lookalike",
      body: `const example = ${JSON.stringify(deny)};`,
    },
    {
      name: "nested unused function",
      body: `const example = () => {${deny}};`,
    },
    {
      name: "denial after an awaited read",
      body: `await readLedger(); ${deny}`,
    },
    {
      name: "denial after a started promise",
      body: `const result = readLedger(); ${deny} await result;`,
    },
    {
      name: "fake returned 403 object",
      body: deny.replace(
        'throw new Response("Forbidden",',
        'return makeSuccess("Forbidden",',
      ),
    },
  ])("rejects $name", ({ body }) => {
    const offenders = checkReadRoleFloors(
      fixture(source("loader", body)),
    ).offenders;
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain("$id/billing.loader.server.ts: read=");
    expect(offenders[0]).toContain("write=admin");
  });

  test("recognizes a returned forbidden routeData action", () => {
    const returned = source(
      "action",
      `if (!hasMinRole(userRole, MemberRole.Admin)) return routeData({error:'Forbidden'}, {status:403});`,
    );
    expect(
      checkReadRoleFloors(
        fixture(source("loader", "await readLedger();"), [], returned),
      ).offenders,
    ).toHaveLength(1);
  });

  test("recognizes aliased canonical imports", () => {
    const aliased = source("loader", deny)
      .replace("hasMinRole}", "hasMinRole as permits}")
      .replace("MemberRole}", "MemberRole as Roles}")
      .replace("!hasMinRole(", "!permits(")
      .replace("MemberRole.Admin", "Roles.Admin");
    expect(checkReadRoleFloors(fixture(aliased)).offenders).toEqual([]);
  });

  test("traces renamed bindings back to the authenticated role row", () => {
    const renamed = source("loader", deny)
      .replace("({auth})", "({auth: result})")
      .replace(
        "const {userRole} = auth.ctx",
        "const {userRole: membership} = result.ctx",
      )
      .replace("userRole.role,", "membership.role,");
    expect(checkReadRoleFloors(fixture(renamed)).offenders).toEqual([]);
  });

  test("recognizes the min-role auth strategy and rejects weakening it", () => {
    const strategy =
      `import {dataPlaneSessionMinRoleAuth} from "@/lib/capability-guard.server"; ${source("loader", "await readLedger();")}`.replace(
        "auth: workspaceLoaderAuth",
        "auth: dataPlaneSessionMinRoleAuth(MemberRole.Admin)",
      );
    expect(checkReadRoleFloors(fixture(strategy)).offenders).toEqual([]);
    expect(
      checkReadRoleFloors(
        fixture(
          strategy.replace("Auth(MemberRole.Admin)", "Auth(MemberRole.Member)"),
        ),
      ).offenders,
    ).toHaveLength(1);
  });

  test("a stricter Owner read floor passes an Admin write floor", () => {
    expect(
      checkReadRoleFloors(
        fixture(
          source(
            "loader",
            deny.replace("MemberRole.Admin", "MemberRole.Owner"),
          ),
        ),
      ).offenders,
    ).toEqual([]);
  });

  test("an exact existing asymmetry is recorded but cannot excuse a changed floor", () => {
    const baseline = [
      {
        route: "$id/billing.loader.server.ts",
        loaderFloor: "caller",
        actionFloor: "admin",
        reason: "Owned fixture: known asymmetry",
      },
    ];
    const root = fixture(source("loader", "await readLedger();"), baseline);
    expect(checkReadRoleFloors(root)).toEqual({ offenders: [], baselined: 1 });
    writeFileSync(
      join(root, "app/routes/workspaces+/$id/billing.action.server.ts"),
      action.replace("MemberRole.Admin", "MemberRole.Owner"),
    );
    expect(checkReadRoleFloors(root).offenders).toHaveLength(2);
  });

  test("a repaired or removed route cannot leave a stale baseline entry", () => {
    const baseline = [
      {
        route: "$id/billing.loader.server.ts",
        loaderFloor: "caller",
        actionFloor: "admin",
        reason: "Owned fixture",
      },
    ];
    const root = fixture(source("loader", deny), baseline);
    expect(checkReadRoleFloors(root).offenders).toHaveLength(1);
    rmSync(join(root, "app/routes/workspaces+/$id/billing.loader.server.ts"));
    expect(checkReadRoleFloors(root).offenders).toHaveLength(1);
  });

  test("a baseline without a reason does not permit a mismatch", () => {
    const baseline = [
      {
        route: "$id/billing.loader.server.ts",
        loaderFloor: "caller",
        actionFloor: "admin",
      },
    ];
    expect(
      checkReadRoleFloors(
        fixture(source("loader", "await readLedger();"), baseline),
      ).offenders,
    ).toHaveLength(2);
  });

  test("the actual billing page and action both enforce the Admin contract", () => {
    const base = join(process.cwd(), "app/routes/workspaces+/$id/billing");
    expect(
      readRoleFloor(readFileSync(`${base}.loader.server.ts`, "utf8"), "loader"),
    ).toBe("admin");
    expect(
      readRoleFloor(readFileSync(`${base}.action.server.ts`, "utf8"), "action"),
    ).toBe("admin");
    expect(checkReadRoleFloors(process.cwd()).offenders).toEqual([]);
  });
});
