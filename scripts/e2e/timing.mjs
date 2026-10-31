import { appendFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

/** Record each completed phase, including failures, before the harness exits. */
export async function timeE2ePhase(name, action) {
  const started = performance.now();
  let result = "failed";
  try {
    const value = await action();
    result = "passed";
    return value;
  } finally {
    const seconds = ((performance.now() - started) / 1000).toFixed(3);
    console.log(`[e2e-timing] ${name}: ${seconds}s (${result})`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `- **${name}**: ${seconds}s (${result})\n`,
      );
    }
  }
}
