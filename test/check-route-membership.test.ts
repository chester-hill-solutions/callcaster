import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

const script = path.resolve(import.meta.dirname, "../scripts/check-route-membership.mjs");
let fixture: string;
beforeEach(() => { fixture = mkdtempSync(path.join(tmpdir(), "webhook-membership-")); });
afterEach(() => { rmSync(fixture, { recursive: true, force: true }); });
function write(relative: string, source: string) {
  const file = path.join(fixture, "app", relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, source);
}
function run() {
  try {
    return { status: 0, output: execFileSync(process.execPath, [script], { cwd: fixture, encoding: "utf8", stdio: "pipe" }) };
  } catch (error) {
    if (!error || typeof error !== "object" || !("status" in error) || !("stderr" in error)) throw error;
    return { status: error.status, output: String(error.stderr) };
  }
}
const sessionExternal = `export const action = defineAction({
  auth: ({ request }) => requireJsonAuth(request),
  sideEffects: ["external"], handler: () => send(),
});`;

describe("route membership guard", () => {
  test("rejects a new external relay without any workspace token", () => {
    write("routes/api+/relay.action.server.ts", sessionExternal);
    const result = run();
    expect(result.status).toBe(1);
    expect(result.output).toContain("api+/relay.action.server.ts");
  });
  test("an unused direct guard import cannot prove membership", () => {
    write("routes/api+/relay.action.server.ts", 'import { requireWorkspaceAccess } from "@/lib/access.server";\n' + sessionExternal);
    const result = run();
    expect(result.status).toBe(1);
    expect(result.output).toContain("relay.action.server.ts");
  });
  test("multiline unused workspace strategy imports cannot prove access", () => {
    write("routes/api+/relay.action.server.ts", 'import {\n workspaceRouteAuth,\n} from "@/lib/access.server";\n' + sessionExternal);
    expect(run().status).toBe(1);
  });
  test("multiline unused provider imports cannot grant an exemption", () => {
    write("routes/api+/relay.action.server.ts", 'import {\n validateTwilioWebhook,\n} from "@/lib/provider.server";\n' + sessionExternal);
    expect(run().status).toBe(1);
  });
  test("a single-line external action is still examined", () => {
    write("routes/api+/relay.action.server.ts", sessionExternal.replace(/\n/g, " "));
    expect(run().status).toBe(1);
  });
  test("an unused service import cannot prove membership", () => {
    write("lib/service.server.ts", 'export async function guardedSend() { await requireWorkspaceAccess({ user, workspaceId }); }');
    write("routes/api+/relay.action.server.ts", 'import { guardedSend } from "@/lib/service.server";\n' + sessionExternal);
    expect(run().status).toBe(1);
  });
  test("a called service with a workspace guard passes, including an alias", () => {
    write("lib/service.server.ts", 'export async function guardedSend() { await requireWorkspaceAccess({ user, workspaceId }); }');
    write("routes/api+/relay.action.server.ts", 'import { guardedSend as deliver } from "@/lib/service.server";\n' + sessionExternal.replace('send()', 'deliver()'));
    expect(run().status).toBe(0);
  });
  test("a guarded auth strategy passed to the handler passes", () => {
    write("lib/access.server.ts", 'export async function access() { return getDataPlaneRouteContext(context); }');
    write("routes/api+/relay.action.server.ts", 'import { access } from "@/lib/access.server";\n' + sessionExternal.replace('({ request }) => requireJsonAuth(request)', 'access'));
    expect(run().status).toBe(0);
  });
  test("a direct workspace guard passes", () => {
    write("routes/api+/relay.action.server.ts", sessionExternal.replace('handler: () => send()', 'handler: async () => { await requireWorkspaceAccess({ user, workspaceId }); return send(); }'));
    expect(run().status).toBe(0);
  });
  test.each(["api+/auth/token.action.server.ts", "api+/auth/refresh.action.server.ts", "api+/auth/$.loader.server.ts"])("keeps the explicit user auth exception %s", (name) => {
    write(`routes/${name}`, sessionExternal);
    expect(run().status).toBe(0);
  });
  test("the auth exception does not permit the same relay at another path", () => {
    write("routes/api+/auth/relay.action.server.ts", sessionExternal);
    expect(run().status).toBe(1);
  });
  test("an unused provider helper cannot exempt an external relay", () => {
    write("lib/provider.server.ts", 'export async function signed() { await requireTwilioSignature(request); }');
    write("routes/api+/relay.action.server.ts", 'import { signed } from "@/lib/provider.server";\n' + sessionExternal);
    expect(run().status).toBe(1);
  });
  test("a called provider adapter retains its exemption", () => {
    write("lib/provider.server.ts", 'export async function signed() { await requireTwilioSignature(request); }');
    write("routes/api+/provider.action.server.ts", 'import { signed } from "@/lib/provider.server";\n' + sessionExternal.replace('requireJsonAuth(request)', 'signed(request)'));
    expect(run().status).toBe(0);
  });
  test("keeps signed provider callbacks", () => {
    write("routes/api+/provider.action.server.ts", sessionExternal.replace('requireJsonAuth(request)', 'requireTwilioSignature(request)'));
    expect(run().status).toBe(0);
  });
  test("keeps signed cron actions", () => {
    write("routes/api+/cron.action.server.ts", sessionExternal.replace('requireJsonAuth(request)', 'verifyCronSecret(request)'));
    expect(run().status).toBe(0);
  });
});
