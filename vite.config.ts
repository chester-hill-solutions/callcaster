import path from "node:path";
import { fileURLToPath } from "node:url";
import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const appDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.join(appDir, "app"),
    },
  },
  plugins: [
    remix({
      future: {
        v3_routeConfig: true,
      },
    }),
    tsconfigPaths(),
  ],
});
