import { defineConfig } from "tsup"

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/lib/utils.ts",
    "src/hooks/use-mobile.ts",
    "src/components/ui/*.tsx",
    "!src/components/ui/*.test.tsx",
  ],
  format: ["esm"],
  dts: true,
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
  treeshake: true,
})
