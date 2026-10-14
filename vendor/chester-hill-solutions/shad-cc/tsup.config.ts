import { defineConfig } from "tsup"
import { readdirSync } from "node:fs"

// tsup expands array globs asynchronously. Keep public entry names and order fixed.
const entryPaths = [
  "src/index.ts",
  "src/lib/utils.ts",
  "src/hooks/use-mobile.ts",
  ...readdirSync(new URL("./src/components/ui/", import.meta.url))
    .filter((file) => file.endsWith(".tsx") && !file.endsWith(".test.tsx"))
    .map((file) => `src/components/ui/${file}`),
].sort()

export default defineConfig({
  entry: Object.fromEntries(entryPaths.map((file) => [file.slice(4).replace(/\.tsx?$/, ""), file])),
  format: ["esm"],
  // Emit declarations once with tsc after bundling; per-file Rollup emission can
  // assign different union-member order from identical source.
  dts: false,
  splitting: true,
  sourcemap: true,
  clean: true,
  external: [
    "react",
    "react-dom",
    "react/jsx-runtime",
    "react-aria-components",
    "lucide-react",
  ],
  // esbuild bundles these modules. Consumer builds perform final tree shaking;
  // tsup's additional per-file Rollup pass can reorder unchanged imports.
  treeshake: false,
})
