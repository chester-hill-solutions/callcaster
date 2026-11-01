import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import { voiceBillingHandlerSignals } from "../scripts/lib/voice-billing-handler-signals.mjs";

const syncImport = 'import { runCallStatusSideEffects as finish } from "@/lib/worker/webhook-side-effects.server";';
const asyncImport = 'import * as results from "@/lib/worker/enqueue-call-status.server";';
const runner = resolve('scripts/check-handlers.mjs');
const baseline = resolve('scripts/capability-baseline.json');

function check(source: string, extension: string) {
  const fixture = mkdtempSync(join(tmpdir(), 'voice-billing-handler-'));
  const before = readFileSync(baseline);
  try {
    for (const dir of ['app/routes', 'app/lib', 'docs']) mkdirSync(join(fixture, dir), { recursive: true });
    writeFileSync(join(fixture, 'app/lib/capabilities.ts'), 'export const PRODUCT_CAPABILITIES = {\n} as const;');
    writeFileSync(join(fixture, 'app/lib/api-surface-generated.ts'), 'export const API_SURFACE_CORE = [];');
    writeFileSync(join(fixture, 'app/routes/voice.' + extension), source);
    const result = spawnSync(process.execPath, [runner], { cwd: fixture, encoding: 'utf8' });
    return { status: result.status, output: result.stdout + result.stderr,
      inventory: readFileSync(join(fixture, 'docs/credit-handler-inventory.md'), 'utf8') };
  } finally {
    expect(readFileSync(baseline)).toEqual(before);
    rmSync(fixture, { recursive: true, force: true });
  }
}
const route = (imports: string, body: string, credit: boolean) => `${imports}\nexport const action = defineAction({ sideEffects: [${credit ? '"credit"' : '"db-write"'}], handler: async () => { ${body} } });`;

describe('voice outcome billing handler signals', () => {
  test('tracks named aliases, namespaces and relative imports', () => {
    expect([...voiceBillingHandlerSignals(syncImport + '\nfinish({});')]).toEqual(['sync']);
    expect([...voiceBillingHandlerSignals(asyncImport + '\nresults.enqueueCallStatusSideEffects(call, params);')]).toEqual(['async']);
    expect([...voiceBillingHandlerSignals('import { runCallStatusSideEffects as finish } from "../lib/worker/webhook-side-effects.server";\nfinish({});', 'app/routes/voice.js')]).toEqual(['sync']);
  });
  test.each([
    syncImport,
    syncImport + '\n// finish({});',
    syncImport + '\nconst example = "finish({})";',
    syncImport + '\nfunction local(finish) { finish({}); }',
    asyncImport + '\nfunction local(results) { results.enqueueCallStatusSideEffects(call, params); }',
    'import { runCallStatusSideEffects as finish } from "@/unrelated"; finish({});',
  ])('ignores imports, text and shadowed or unrelated functions: %s', source => {
    expect([...voiceBillingHandlerSignals(source)]).toEqual([]);
  });
  test.each(['ts', 'tsx', 'js', 'jsx'])('the actual CLI requires both billing boundaries to declare credit in %s', extension => {
    for (const [imports, body, signal] of [[syncImport, 'await finish({});', 'sync-call-billing'],
      [asyncImport, 'await results.enqueueCallStatusSideEffects(call, params);', 'async-call-billing']]) {
      const refused = check(route(imports, body, false), extension);
      expect(refused.status).toBe(1); expect(refused.output).toContain(signal);
      const allowed = check(route(imports, body, true), extension);
      expect(allowed.status).toBe(0); expect(allowed.inventory).toContain(signal);
    }
  });
  test('the actual CLI rejects a credit declaration supported only by a comment', () => {
    const result = check(route(syncImport, '// finish({});\n return null;', true), 'ts');
    expect(result.status).toBe(1); expect(result.output).toContain('matches no credit-write signal');
  });
});
