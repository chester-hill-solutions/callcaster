import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const appDir = path.dirname(fileURLToPath(import.meta.url));

function resolveAppModuleSuffix(suffix: ".server" | ".client"): Plugin {
  return {
    name: `resolve-app-${suffix.slice(1)}-modules`,
    enforce: "pre",
    resolveId(source) {
      if (!source.startsWith("@/") || !source.includes(suffix)) {
        return null;
      }
      if (/\.(ts|tsx|js|jsx)$/.test(source)) {
        return null;
      }
      const base = path.join(appDir, "app", source.slice(2));
      for (const ext of [".ts", ".tsx", ".js", ".jsx"]) {
        const candidate = `${base}${ext}`;
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [
    resolveAppModuleSuffix(".server"),
    resolveAppModuleSuffix(".client"),
    reactRouter(),
    tsconfigPaths(),
  ],
  server: {
    port: Number(process.env.PORT ?? 3000),
  },
});
