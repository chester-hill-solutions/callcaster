/** Run a bounded queue. A failure stops new work; active checks still finish. */
export async function runStepQueue(
  steps,
  { jobs, run, shouldStop = () => false },
) {
  if (!Number.isInteger(jobs) || jobs < 1)
    throw new Error("jobs must be a positive integer");
  let cursor = 0;
  let failed = false;
  const results = [];
  async function worker() {
    while (!failed && !shouldStop() && cursor < steps.length) {
      const script = steps[cursor++];
      let result;
      try {
        result = await run(script);
      } catch (error) {
        result = { script, code: 1, ms: 0, error };
      }
      results.push(result);
      if (result.code !== 0) failed = true;
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(jobs, steps.length) }, worker),
  );
  return results;
}

export async function runGatePhases(phases, options) {
  const results = [];
  for (const phase of phases) {
    const completed = await runStepQueue(phase.steps, {
      ...options,
      jobs: phase.parallel ? options.jobs : 1,
    });
    results.push(...completed);
    if (completed.some((result) => result.code !== 0) || options.shouldStop?.())
      break;
  }
  return results;
}
