import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import importPlugin from "eslint-plugin-import";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import globals from "globals";
import { plugin as shadcn } from "@shadcn/lint";
import { noUselessComments } from "./eslint-rules/no-useless-comments.mjs";

/**
 * Flat config (ESLint 9). Ported 1:1 from the former `.eslintrc.cjs` — every
 * rule, override, and exemption is preserved. The only intentional change is
 * the `react-hooks` rule set: v7's `recommended` enables the React Compiler
 * rules, so we register the plugin and keep the two rules the repo has always
 * enforced (`rules-of-hooks`, `exhaustive-deps`).
 */

const TS_FILES = ["**/*.{ts,tsx}"];
const JSX_FILES = ["**/*.{js,jsx,ts,tsx}"];

// Lint-quality ratchet (enforced by check:lint-ratchet against
// scripts/baselines/lint-ratchet.json): strictness rules as `warn` — editors
// surface them, the ratchet fails CI on GROWTH.
const RATCHET_RULES = {
  complexity: ["warn", { max: 20 }],
  "max-depth": ["warn", { max: 4 }],
  "max-params": ["warn", { max: 5 }],
  "max-lines-per-function": [
    "warn",
    { max: 200, skipBlankLines: true, skipComments: true },
  ],
  "no-console": "warn",
  "no-return-await": "warn",
  // `import/no-cycle` is intentionally omitted: under flat config it is ~10x
  // slower (62s for app/lib alone, >15 min for the repo) because the import
  // plugin rebuilds its resolver per file. The 16 known cycles it used to
  // baseline are tracked in #1896 for a dedicated, non-blocking cycle check.
  "@typescript-eslint/no-non-null-assertion": "warn",
};

// `flat/recommended` is [base (parser+plugin), eslint-recommended (TS files), recommended rules].
const tsRecommended = tsPlugin.configs["flat/recommended"];

export default [
  // Replaces the former `.eslintignore`. Dot-directories were auto-ignored by
  // eslintrc; flat config lints them unless listed here.
  {
    ignores: [
      "vendor/**",
      "dist/**",
      "build/**",
      "coverage/**",
      "e2e/playwright-report/**",
      "test-results/**",
      ".opencode/**",
      ".agents/**",
      ".agent/**",
      ".cursor/**",
      ".claude/**",
      ".railway/**",
      ".repl/**",
      ".cache/**",
      ".vite/**",
      ".react-router/**",
      "app/lib/api-generated/**",
      // Vendored Buffer polyfill served as a static asset.
      "public/buffer-polyfill.mjs",
    ],
  },

  // Base language options.
  {
    files: ["**/*.{js,jsx,ts,tsx,mjs,cjs}"],
    // ESLint 9 reports unused eslint-disable directives by default; eslintrc
    // did not. Keep the legacy behaviour so stale directives are not new noise.
    linterOptions: { reportUnusedDisableDirectives: "off" },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.commonjs },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },

  js.configs.recommended,

  // TypeScript.
  { files: TS_FILES, ...tsRecommended[0] },
  { ...tsRecommended[1] },
  { files: TS_FILES, ...tsRecommended[2] },

  // React.
  { files: JSX_FILES, ...react.configs.flat.recommended },
  { files: JSX_FILES, ...react.configs.flat["jsx-runtime"] },
  {
    files: JSX_FILES,
    settings: {
      react: { version: "detect" },
      formComponents: ["Form"],
      linkComponents: [
        { name: "Link", linkAttribute: "to" },
        { name: "NavLink", linkAttribute: "to" },
      ],
    },
  },

  // react-hooks: the two rules the repo has always enforced.
  {
    files: JSX_FILES,
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      // Strengthened to "error" once every effect was annotated (baseline 0 in
      // effects-baseline.json). Intentional omissions need an inline
      // eslint-disable with a reason (the @effect-deps tag). See docs/effects-strictness.md.
      "react-hooks/exhaustive-deps": "error",
    },
  },

  // jsx-a11y.
  { files: JSX_FILES, ...jsxA11y.flatConfigs.recommended },

  // import.
  { files: JSX_FILES, ...importPlugin.flatConfigs.recommended },
  { files: TS_FILES, ...importPlugin.flatConfigs.typescript },

  // Keep the base language options authoritative: eslint-plugin-import's flat
  // config sets `ecmaVersion: 2018`, which fails to parse optional chaining.
  {
    files: ["**/*.{js,jsx,ts,tsx,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    settings: {
      "import/internal-regex": "^~/",
      "import/resolver": {
        node: { extensions: [".ts", ".tsx"] },
        typescript: { alwaysTryTypes: true },
      },
    },
  },

  // TypeScript rule tweaks.
  {
    files: TS_FILES,
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/no-unused-vars": "off",
      // Strictness free-lock: 0 duplicate imports — keep it that way.
      "import/no-duplicates": "error",
      "import/no-named-as-default": "off",
      // Bun's built-in test module is resolved by the Bun runtime, not Node.
      "import/no-unresolved": ["error", { ignore: ["^bun:"] }],
      "react/prop-types": "off",
      "react/no-unescaped-entities": "off",
    },
  },

  {
    files: ["client/functions/**/*.{ts,tsx}"],
    rules: {
      "import/no-unresolved": "off",
    },
  },

  // Routes + lib: disallow file-level @ts-nocheck (archive/old.* exempt).
  {
    files: ["app/routes/**/*.{ts,tsx}", "app/lib/**/*.ts"],
    ignores: ["app/routes/archive/**", "**/old.*"],
    rules: {
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-expect-error": "allow-with-description",
          // @ts-ignore fully banned (stale suppressions surface as
          // @ts-expect-error with a description instead).
          "ts-ignore": true,
          "ts-nocheck": false,
        },
      ],
    },
  },

  // ADR-0004 module boundary: route code must use createTenantDb (@/server/tenant-db)
  // for tenant data and @/db/schema for column references.
  {
    files: ["app/routes/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/server/db",
              message:
                "Routes must use createTenantDb from @/server/tenant-db for tenant data. Use @/db/schema for column references.",
            },
            {
              name: "@/server/admin-db",
              message:
                "The admin (unscoped) client is not importable from routes. Use createTenantDb from @/server/tenant-db.",
            },
            {
              name: "./db",
              message:
                "Routes must use createTenantDb from @/server/tenant-db for tenant data.",
            },
            {
              name: "./admin-db",
              message:
                "The admin (unscoped) client is not importable from routes.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ImportExpression[source.value='@/server/db'], ImportExpression[source.value='@/server/admin-db']",
          message:
            "Routes must use createTenantDb from @/server/tenant-db for tenant data.",
        },
      ],
    },
  },

  // ADR-0031 workspace middleware tree: child handlers read workspaceContext.
  {
    files: ["app/routes/workspaces+/$id/**/*.server.ts"],
    ignores: [
      "app/routes/workspaces+/$id/chats/$contact_number.messages.server.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/auth.server",
              importNames: ["verifyAuth", "getSession"],
              message:
                "Workspace child routes must use getWorkspaceRouteContext from @/lib/workspace-route.server.",
            },
          ],
        },
      ],
    },
  },

  // ADR-0031 data-plane middleware tree: child handlers read dataPlaneAuthContext.
  {
    files: ["app/routes/api+/workspaces+/$workspaceId/**/*.server.ts"],
    ignores: [
      "app/routes/api+/workspaces+/$workspaceId/api-keys.loader.server.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/auth.server",
              importNames: ["verifyAuth"],
              message:
                "Data-plane child routes must use getDataPlaneRouteContext from @/lib/data-plane-route.server.",
            },
            {
              name: "@/lib/api-auth.server",
              importNames: ["requireJsonAuth"],
              message:
                "Data-plane child routes must use getDataPlaneRouteContext from @/lib/data-plane-route.server.",
            },
            {
              name: "@/lib/platform-data.server",
              importNames: ["resolveDataPlaneAuth"],
              message:
                "Data-plane child routes must use getDataPlaneRouteContext from @/lib/data-plane-route.server.",
            },
          ],
        },
      ],
    },
  },

  // ADR-0031 admin middleware tree: child handlers read adminContext.
  {
    files: ["app/routes/admin+/**/*.server.ts"],
    ignores: [
      "app/routes/admin+/route.middleware.server.ts",
      "app/routes/admin+/requireSudoAdmin.server.ts",
      "app/routes/admin+/workspaces/$workspaceId/loadTwilioData.server.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/auth.server",
              importNames: ["verifyAuth"],
              message:
                "Admin child routes must use getAdminRouteContext from @/lib/admin-route.server.",
            },
          ],
        },
      ],
    },
  },

  // Lint-quality ratchet.
  {
    files: JSX_FILES,
    plugins: { "@typescript-eslint": tsPlugin },
    rules: RATCHET_RULES,
  },

  // Design-system rules (@shadcn/lint). Tailwind v4 + components.json gives
  // auto-discovery; `ui` is set explicitly. Warnings ride the same lint ratchet
  // as the strictness rules, so a new raw colour or restyled primitive fails CI.
  {
    files: JSX_FILES,
    plugins: { shadcn },
    settings: {
      shadcn: {
        ui: "@/components/ui",
        componentImports: ["^@chester-hill-solutions/shad-cc(/|$)"],
      },
    },
    rules: {
      "shadcn/no-restyle": ["warn", { allow: ["layout"] }],
      "shadcn/no-raw-colors": "warn",
      "shadcn/no-arbitrary-values": "warn",
      "shadcn/no-inline-styles": "warn",
      "shadcn/no-unknown-classes": "warn",
      "shadcn/require-static-classes": "warn",
    },
  },

  // Repo-authored rules. Comment hygiene is an `error`, not a ratchet warning:
  // the existing offenders are swept in the same change, so it is forward-only
  // from the start.
  {
    files: ["**/*.{js,jsx,ts,tsx,mjs,cjs}"],
    plugins: {
      callcaster: { rules: { "no-useless-comments": noUselessComments } },
    },
    rules: {
      "callcaster/no-useless-comments": "error",
    },
  },

  // Scoped exemptions from the ratchet — each with a reason.
  {
    // Deprecated code is frozen in time; it is not held to new standards.
    files: ["archive/**"],
    rules: {
      complexity: "off",
      "max-depth": "off",
      "max-params": "off",
      "max-lines-per-function": "off",
      "no-console": "off",
      "no-return-await": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    files: [
      "test/**/*.{ts,tsx}",
      "e2e/**/*.{ts,tsx}",
      // CLI/bootstrap surfaces where the logger may not exist yet.
      "scripts/**",
      "worker/**",
      "server/**",
      "app/lib/logger*",
      "app/lib/env.server.ts",
      "app/server/boot-checks*",
    ],
    rules: {
      "no-console": "off",
    },
  },
  {
    // Long test functions are normal; app code is where the 200-line cap bites.
    files: ["test/**/*.{ts,tsx}", "e2e/**/*.{ts,tsx}"],
    rules: {
      "max-lines-per-function": "off",
    },
  },

  // Node globals for config files, scripts, server, worker, and e2e.
  {
    files: [
      "**/*.{mjs,cjs}",
      "scripts/**",
      "server/**",
      "worker/**",
      "e2e/**",
      "*.config.*",
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
