import { availableParallelism, totalmem } from "node:os";
import { defineConfig, defineProject } from "vitest/config";
import node from "./vitest.node.config";
import ui from "./vitest.ui.config";

// Share one budget across both suites. Leave capacity for the production build
// and keep smaller machines bounded. VITEST_MAX_WORKERS remains an override.
const maxWorkers = Math.max(
  1,
  Math.min(
    4,
    availableParallelism() - 2,
    Math.floor(totalmem() / (2 * 1024 ** 3)),
  ),
);

export default defineConfig({
  test: {
    maxWorkers,
    projects: [node, ui].map((config) =>
      defineProject({
        ...config,
        test: { ...config.test, maxWorkers, pool: "forks", isolate: true },
      }),
    ),
  },
});
