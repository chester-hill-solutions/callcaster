import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, afterEach, describe, expect, test } from "vitest";

const script = path.resolve("scripts/check-redirect-targets.mjs");
let fixture: string;
const routes = [{ file: "root.tsx", path: "", children: [
  { file: "routes/index.tsx", index: true },
  { file: "routes/signin.tsx", path: "signin" },
  { file: "routes/workspace.tsx", path: "workspaces/:id", children: [
    { file: "routes/settings.tsx", path: "settings" },
  ] },
  { file: "routes/auth.tsx", path: "api/auth/*" },
  { file: "routes/invite.tsx", path: "invite/:token?" },
  { file: "routes/layout.tsx", children: [{ file: "routes/help.tsx", path: "help" }] },
] }];

function write(file: string, source: string) {
  const target = path.join(fixture, "app", file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, source);
}
function run(tree = routes) {
  const file = path.join(fixture, "routes.json");
  writeFileSync(file, JSON.stringify(tree));
  const result = spawnSync(process.execPath, [script, "--routes-json", file], { cwd: fixture, encoding: "utf8" });
  return { status: result.status, output: result.stdout + result.stderr };
}
function redirect(target: string) {
  write("routes/index.tsx", `import { redirect } from "react-router"; export const loader = () => redirect(${JSON.stringify(target)});`);
}
beforeEach(() => {
  fixture = mkdtempSync(path.join(tmpdir(), "redirect-targets-"));
  for (const name of ["root", "routes/index", "routes/signin", "routes/workspace", "routes/settings", "routes/auth", "routes/invite", "routes/layout", "routes/help"]) {
    write(name + ".tsx", "export default function Page() { return null; }");
  }
});
afterEach(() => { rmSync(fixture, { recursive: true, force: true }); });

describe("literal redirect target guard", () => {
  test.each(["/", "/signin", "/signin?next=%2Fworkspaces#form", "/workspaces/a/settings", "/api/auth/callback/provider", "/invite", "/invite/token", "/help"])("accepts registered target %s", target => {
    redirect(target);
    expect(run().status).toBe(0);
  });
  test.each(["/absent", "/settings", "/workspaces/a/absent", "/signin/child", "/api/unknown", "/absent?next=/signin#form"])("rejects absent target %s", target => {
    redirect(target);
    const result = run();
    expect(result.status).toBe(1);
    expect(result.output).toContain("routes/index.tsx:1");
    expect(result.output).toContain(target);
  });
  test("finds multiline named aliases", () => {
    write("routes/index.tsx", 'import { redirect as navigate } from "react-router";\nexport const loader = () => navigate(\n"/absent"\n);');
    const result = run();
    expect(result.status).toBe(1);
    expect(result.output).toContain("index.tsx:3 /absent");
  });
  test("finds namespace redirectDocument and literal templates", () => {
    write("routes/index.tsx", 'import * as rr from "react-router"; export const action = () => rr.redirectDocument(`/absent`);');
    expect(run().status).toBe(1);
  });
  test("keeps query and hash handling in the router matcher", () => {
    redirect("/workspaces/a/settings?view=cost#summary");
    const result = run();
    expect(result.status).toBe(0);
    expect(result.output).toContain("1 literal local targets");
  });
  test("follows route-local loader re-exports", () => {
    write("routes/index.tsx", 'export { loader } from "./handlers/session.loader.server";');
    write("routes/handlers/session.loader.server.ts", 'import { redirect } from "react-router"; export const loader = () => redirect("/absent");');
    const result = run();
    expect(result.status).toBe(1);
    expect(result.output).toContain("session.loader.server.ts:1");
  });
  test("follows route-local imported action modules", () => {
    write("routes/index.tsx", 'import { action } from "./session.action.server"; export { action };');
    write("routes/session.action.server.ts", 'import { redirect } from "react-router"; export const action = () => redirect("/absent");');
    expect(run().status).toBe(1);
  });
  test("checks redirects in the registered root module", () => {
    write("root.tsx", 'import { redirect } from "react-router"; export const loader = () => redirect("/absent");');
    const result = run();
    expect(result.status).toBe(1);
    expect(result.output).toContain("root.tsx:1 /absent");
  });
  test("follows the registered root loader", () => {
    write("root.tsx", 'export { loader } from "./root.loader.server";');
    write("root.loader.server.ts", 'import { redirect } from "react-router"; export const loader = () => redirect("/absent");');
    const result = run();
    expect(result.status).toBe(1);
    expect(result.output).toContain("root.loader.server.ts:1 /absent");
  });
  test("fails closed for a missing registered root", () => {
    rmSync(path.join(fixture, "app/root.tsx"));
    const result = run();
    expect(result.status).toBe(1);
    expect(result.output).toContain("Registered route source is missing");
  });
  test("follows directory index loader imports", () => {
    write("routes/index.tsx", 'export { loader } from "./handlers";');
    write("routes/handlers/index.ts", 'import { redirect } from "react-router"; export const loader = () => redirect("/absent");');
    const result = run();
    expect(result.status).toBe(1);
    expect(result.output).toContain("handlers/index.ts:1 /absent");
  });
  test("accepts a valid redirect through a directory index", () => {
    write("routes/index.tsx", 'export { loader } from "./handlers";');
    write("routes/handlers/index.ts", 'import { redirect } from "react-router"; export const loader = () => redirect("/signin");');
    const result = run();
    expect(result.status).toBe(0);
    expect(result.output).toContain("1 literal local targets");
  });
  test("ignores a route-local CSS import while checking the route redirect", () => {
    write("routes/index.tsx", 'import "./screen.css"; import { redirect } from "react-router"; export const loader = () => redirect("/signin");');
    write("routes/screen.css", "body { color: red; }");
    const result = run();
    expect(result.status).toBe(0);
    expect(result.output).toContain("1 literal local targets");
  });
  test("ignores a root-local image import while checking the root redirect", () => {
    write("root.tsx", 'import logo from "./logo.png"; import { redirect } from "react-router"; export const loader = () => redirect("/signin");');
    write("logo.png", "fixture image bytes");
    const result = run();
    expect(result.status).toBe(0);
    expect(result.output).toContain("1 literal local targets");
  });
  test("does not scan an unregistered orphan module", () => {
    redirect("/signin");
    write("routes/orphan.loader.server.ts", 'import { redirect } from "react-router"; export const loader = () => redirect("/absent");');
    expect(run().status).toBe(0);
  });
  test("ignores comments and strings that look like calls", () => {
    write("routes/index.tsx", 'import { redirect } from "react-router"; // redirect("/absent")\nconst example = \'redirect("/absent")\'; export const loader = () => redirect("/signin");');
    expect(run().status).toBe(0);
  });
  test("uses lexical bindings for a shadowed redirect name", () => {
    write("routes/index.tsx", 'import { redirect } from "react-router"; function other(redirect: (s: string) => string) { return redirect("/absent"); } export const loader = () => redirect("/signin");');
    expect(run().status).toBe(0);
  });
  test("does not classify a same-name function from another package", () => {
    write("routes/index.tsx", 'import { redirect } from "elsewhere"; export const loader = () => redirect("/absent");');
    expect(run().status).toBe(0);
  });
  test("reports runtime and external targets without claiming validation", () => {
    write("routes/index.tsx", 'import { redirect } from "react-router"; export const loader = (id: string) => redirect(`/workspaces/${id}/settings`); export const action = () => redirect("https://provider.example/return");');
    const result = run();
    expect(result.status).toBe(0);
    expect(result.output).toContain("1 runtime targets and 1 external/other references remain unchecked");
  });
  test("fails closed for an empty tree", () => {
    expect(run([]).status).toBe(1);
  });
  test("fails closed for missing registered source", () => {
    rmSync(path.join(fixture, "app/routes/signin.tsx"));
    expect(run().status).toBe(1);
  });
});
