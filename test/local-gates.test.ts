import { afterEach, describe, expect, test, vi } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PREPARE_STEPS,
  CHECK_STEPS,
  SLOW_STEPS,
  gatePhases,
} from "../scripts/lib/local-gate-plan.mjs";
import {
  runGatePhases,
  runStepQueue,
} from "../scripts/lib/local-gate-runner.mjs";
import { validateGatePlan } from "../scripts/check-ci-local-order.mjs";

const root = join(import.meta.dirname, "..");
const scripts = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
).scripts;
const plan = () => ({
  prepare: [...PREPARE_STEPS],
  checks: [...CHECK_STEPS],
  slow: [...SLOW_STEPS],
});

function controlledRun() {
  const started: string[] = [];
  const pending = new Map<
    string,
    (result: { script: string; code: number }) => void
  >();
  return {
    started,
    run: (script: string) =>
      new Promise<{ script: string; code: number }>((resolve) => {
        started.push(script);
        pending.set(script, resolve);
      }),
    finish: (script: string, code = 0) => {
      const resolve = pending.get(script);
      if (!resolve) throw new Error(`Check did not start: ${script}`);
      resolve({ script, code });
    },
  };
}

describe("local gate scheduling", () => {
  test("fills two slots, then starts the next check only after a slot is free", async () => {
    const control = controlledRun();
    const task = runStepQueue(["a", "b", "c"], { jobs: 2, run: control.run });
    expect(control.started).toEqual(["a", "b"]);
    control.finish("a");
    await vi.waitFor(() => expect(control.started).toEqual(["a", "b", "c"]));
    control.finish("b");
    control.finish("c");
    expect((await task).map((result) => result.script).sort()).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  test("stops queued work on failure and waits for active work before returning", async () => {
    const control = controlledRun();
    let done = false;
    const task = runStepQueue(["broken", "active", "queued"], {
      jobs: 2,
      run: control.run,
    }).then((results) => {
      done = true;
      return results;
    });
    control.finish("broken", 9);
    await Promise.resolve();
    expect(done).toBe(false);
    expect(control.started).toEqual(["broken", "active"]);
    control.finish("active");
    expect(await task).toContainEqual({ script: "broken", code: 9 });
    expect(control.started).toEqual(["broken", "active"]);
  });

  test("a thrown launch error fails the gate before a later phase starts", async () => {
    const started: string[] = [];
    const results = await runGatePhases(
      [
        { steps: ["missing-tool"], parallel: false },
        { steps: ["build"], parallel: false },
      ],
      {
        jobs: 2,
        run: async (script: string) => {
          started.push(script);
          throw new Error("ENOENT");
        },
      },
    );
    expect(started).toEqual(["missing-tool"]);
    expect(results[0]?.code).toBe(1);
  });

  test("serial phases stay serial and parallel phases wait for preparation", async () => {
    const control = controlledRun();
    const task = runGatePhases(
      [
        { steps: ["vendor", "lint"], parallel: false },
        { steps: ["guard-a", "guard-b"], parallel: true },
        { steps: ["test", "build"], parallel: false },
      ],
      { jobs: 2, run: control.run },
    );
    expect(control.started).toEqual(["vendor"]);
    control.finish("vendor");
    await vi.waitFor(() => expect(control.started).toEqual(["vendor", "lint"]));
    control.finish("lint");
    await vi.waitFor(() => expect(control.started).toHaveLength(4));
    expect(control.started.slice(2)).toEqual(["guard-a", "guard-b"]);
    control.finish("guard-a");
    await Promise.resolve();
    expect(control.started).not.toContain("test");
    control.finish("guard-b");
    await vi.waitFor(() => expect(control.started.at(-1)).toBe("test"));
    expect(control.started).not.toContain("build");
    control.finish("test");
    await vi.waitFor(() => expect(control.started.at(-1)).toBe("build"));
    control.finish("build");
    expect(await task).toHaveLength(6);
  });

  test("cancellation stops new checks and later phases", async () => {
    let cancelled = false;
    const started: string[] = [];
    const results = await runGatePhases(
      [
        { steps: ["first", "queued"], parallel: false },
        { steps: ["later"], parallel: true },
      ],
      {
        jobs: 2,
        shouldStop: () => cancelled,
        run: async (script: string) => {
          started.push(script);
          cancelled = true;
          return { script, code: 0 };
        },
      },
    );
    expect(started).toEqual(["first"]);
    expect(results).toHaveLength(1);
  });

  test.each([0, -1, 1.5])("rejects invalid concurrency %s", async (jobs) => {
    await expect(
      runStepQueue(["check"], { jobs, run: vi.fn() }),
    ).rejects.toThrow("positive integer");
  });
});

describe("local gate coverage and order", () => {
  test("keeps every check from the previous full gate exactly once", () => {
    const required =
      `check:ci-local-order check:vendor-dist check:bun-lock typecheck lint check:lint-ratchet
      tools:routes:verify tools:api:surface:check check:route-server-leaks check:route-authz
      check:route-membership check:workspace-projection check:unscoped-db-imports check:twilio-webhooks
      check:request-body-consumption check:middleware check:credit-writes check:dual-auth check:auth-rate-limits
      check:effects check:type-safety check:pg-errors check:dry check:handlers check:test-mocks check:db-rpcs
      check:queue-rpc-contract check:relative-redirects check:redirect-targets check:sheet-bodies check:no-pii-exports
      db:ledger:check db:bootstrap:check db:enums:check db:orphans:check tools:check-file-size check:test-echo
      test:node test:ui build check:client-bundle ci:codegen:verify`.split(
        /\s+/,
      );
    expect(gatePhases().flatMap((phase) => phase.steps)).toEqual(required);
    expect(validateGatePlan(scripts, plan())).toEqual([]);
  });

  test("fast mode omits only the five slow checks", () => {
    const fast = gatePhases(true).flatMap((phase) => phase.steps);
    expect(fast).not.toContain("test:node");
    expect(fast).not.toContain("test:ui");
    expect(
      gatePhases()
        .flatMap((phase) => phase.steps)
        .slice(fast.length),
    ).toEqual([
      "test:node",
      "test:ui",
      "build",
      "check:client-bundle",
      "ci:codegen:verify",
    ]);
  });

  test("rejects missing, duplicate and reordered checks", () => {
    const missingScript = { ...scripts };
    delete missingScript["check:middleware"];
    expect(validateGatePlan(missingScript, plan()).join("\n")).toContain(
      "Missing package script: check:middleware",
    );
    const duplicate = plan();
    duplicate.checks.push("lint");
    expect(validateGatePlan(scripts, duplicate).join("\n")).toContain(
      "Duplicate step: lint",
    );
    const reordered = plan();
    reordered.prepare.reverse();
    reordered.slow.reverse();
    expect(validateGatePlan(scripts, reordered)).toHaveLength(2);
  });
});

describe("local gate command", () => {
  const fixtures: string[] = [];
  afterEach(() => {
    for (const dir of fixtures.splice(0))
      rmSync(dir, { recursive: true, force: true });
  });

  function fixture(first: string) {
    const dir = mkdtempSync(join(tmpdir(), "local-gate-test-"));
    fixtures.push(dir);
    mkdirSync(join(dir, "scripts", "lib"), { recursive: true });
    for (const file of ["run-local-gate.mjs", "lib/local-gate-runner.mjs"]) {
      copyFileSync(join(root, "scripts", file), join(dir, "scripts", file));
    }
    writeFileSync(
      join(dir, "scripts", "lib", "local-gate-plan.mjs"),
      'export function gatePhases() { return [{ steps: ["first", "second"], parallel: false }]; }',
    );
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        scripts: {
          first,
          second: "node -e \"console.log('SECOND_CHECK')\"",
        },
      }),
    );
    return dir;
  }

  function run(dir: string, args: string[] = []) {
    return spawnSync(
      process.execPath,
      [join(dir, "scripts", "run-local-gate.mjs"), ...args],
      {
        encoding: "utf8",
        timeout: 20_000,
      },
    );
  }

  test("preserves a real child failure, prints its output, and stops the next check", () => {
    const dir = fixture(
      "node -e \"console.error('EXPECTED_FAILURE'); process.exit(9)\"",
    );
    const result = run(dir);
    expect(result.status).toBe(9);
    expect(result.stderr).toContain("EXPECTED_FAILURE");
    expect(result.stderr).toContain("Full log:");
    expect(result.stdout).not.toContain("[start] second");
    const cache = join(dir, "node_modules", ".cache", "local-gates");
    const log = join(cache, readdirSync(cache)[0] ?? "missing", "first.log");
    expect(readFileSync(log, "utf8")).toContain("EXPECTED_FAILURE");
  });

  test("reports a completed gate and keeps fast-mode scope visible", () => {
    const dir = fixture("node -e \"console.log('FIRST_CHECK')\"");
    const result = run(dir, ["--fast", "--jobs=1"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASSED: 2 checks");
    expect(result.stdout).toContain("Run npm run ci:local before a push or PR");
    expect(result.stdout).toContain("[pass] second");
  });

  test("invalid options fail before starting any check", () => {
    const result = run(fixture('node -e "process.exit(0)"'), ["--jobs=0"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--jobs must be an integer from 1 to 4");
    expect(result.stdout).not.toContain("[start]");
  });

  test.skipIf(process.platform === "win32")(
    "SIGTERM stops the running process group",
    async () => {
      const dir = fixture("node hold.mjs");
      writeFileSync(
        join(dir, "hold.mjs"),
        'import { writeFileSync } from "node:fs"; writeFileSync("ready", String(process.pid)); setInterval(() => {}, 1000);',
      );
      const child = spawn(
        process.execPath,
        [join(dir, "scripts", "run-local-gate.mjs")],
        { stdio: "pipe" },
      );
      let output = "";
      child.stdout.on("data", (data) => {
        output += data;
      });
      const closed = new Promise((resolve) => child.on("close", resolve));
      try {
        await vi.waitFor(
          () => expect(existsSync(join(dir, "ready"))).toBe(true),
          { timeout: 5000 },
        );
        const pid = Number(readFileSync(join(dir, "ready"), "utf8"));
        child.kill("SIGTERM");
        expect(await closed).toBe(143);
        expect(output).not.toContain("[start] second");
        await vi.waitFor(() => expect(() => process.kill(pid, 0)).toThrow(), {
          timeout: 5000,
        });
      } finally {
        child.kill("SIGKILL");
      }
    },
  );
});
