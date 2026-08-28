/**
 * This is intended to be a basic starting point for linting in your app.
 * It relies on recommended configs out of the box for simplicity, but you can
 * and should modify this configuration to best suit your team's needs.
 */

/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
  env: {
    browser: true,
    commonjs: true,
    es6: true,
  },

  // Base config
  extends: ["eslint:recommended"],

  overrides: [
    // React
    {
      files: ["**/*.{js,jsx,ts,tsx}"],
      plugins: ["react", "jsx-a11y"],
      extends: [
        "plugin:react/recommended",
        "plugin:react/jsx-runtime",
        "plugin:react-hooks/recommended",
        "plugin:jsx-a11y/recommended",
      ],
      settings: {
        react: {
          version: "detect",
        },
        formComponents: ["Form"],
        linkComponents: [
          { name: "Link", linkAttribute: "to" },
          { name: "NavLink", linkAttribute: "to" },
        ],
        "import/resolver": {
          typescript: {},
        },
      },
    },

    // Typescript
    {
      files: ["**/*.{ts,tsx}"],
      plugins: ["@typescript-eslint", "import"],
      parser: "@typescript-eslint/parser",
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-empty-object-type": "off",
        "@typescript-eslint/no-require-imports": "off",
        "@typescript-eslint/no-unused-expressions": "off",
        "@typescript-eslint/no-unused-vars": "off",
        // Strictness free-lock: 0 duplicate imports after the database.server
        // barrel removal — keep it that way.
        "import/no-duplicates": "error",
        "import/no-named-as-default": "off",
        "react/prop-types": "off",
        "react/no-unescaped-entities": "off",
      },
      settings: {
        "import/internal-regex": "^~/",
        "import/resolver": {
          node: {
            extensions: [".ts", ".tsx"],
          },
          typescript: {
            alwaysTryTypes: true,
          },
        },
      },
      extends: [
        "plugin:@typescript-eslint/recommended",
        "plugin:import/recommended",
        "plugin:import/typescript",
      ],
    },
    {
      files: ["client/functions/**/*.{ts,tsx}"],
      rules: {
        "import/no-unresolved": "off",
      },
    },
    // RR7 routes + lib: disallow file-level @ts-nocheck (archive/old.* exempt)
    {
      files: ["app/routes/**/*.{ts,tsx}", "app/lib/**/*.ts"],
      excludedFiles: ["app/routes/archive/**", "**/old.*"],
      rules: {
        "@typescript-eslint/ban-ts-comment": [
          "error",
          {
            "ts-expect-error": "allow-with-description",
            // Strengthened: @ts-ignore fully banned (the 2 stale AWS-SDK
            // suppressions were removed and typecheck stayed clean). Use
            // @ts-expect-error with a description so stale suppressions surface.
            "ts-ignore": true,
            "ts-nocheck": false,
          },
        ],
      },
    },
    // ADR-0004 module boundary: route code must use createTenantDb (@/server/tenant-db)
    // for tenant data and @/db/schema for column references. The unscoped db and
    // admin clients are server-internal only — importing them from routes is a
    // cross-tenant leak hazard.
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
      excludedFiles: [
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
      excludedFiles: [
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
      excludedFiles: [
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
    {
      files: ["**/*.{js,jsx,ts,tsx}"],
      rules: {
        // Strengthened to "error" once every effect was annotated (baseline 0
        // in effects-baseline.json) and every dep warning resolved. New
        // violations now hard-fail; intentional omissions need an inline
        // eslint-disable with a reason (captured in the @effect-deps tag).
        // See docs/effects-strictness.md.
        "react-hooks/exhaustive-deps": "error",
      },
    },

    // Lint-quality ratchet (enforced by check:lint-ratchet against
    // scripts/baselines/lint-ratchet.json): strictness rules as `warn` —
    // editors surface them, the ratchet fails CI on GROWTH. Tone: warn in
    // the editor is an invitation to whittle the baseline down, never a
    // licence to add.
    {
      files: ["**/*.{js,jsx,ts,tsx}"],
      rules: {
        "complexity": ["warn", { max: 20 }],
        "max-depth": ["warn", { max: 4 }],
        "max-params": ["warn", { max: 5 }],
        "max-lines-per-function": ["warn", { max: 200, skipBlankLines: true, skipComments: true }],
        "no-console": "warn",
        "no-return-await": "warn",
        // maxDepth 4 keeps the cycle search fast; deep cycles are the
        // painful kind anyway.
        "import/no-cycle": ["warn", { maxDepth: 4 }],
        "@typescript-eslint/no-non-null-assertion": "warn",
      },
    },
    // Scoped exemptions from the ratchet — each with a reason. These stay
    // out of the baseline counts (see check-lint-ratchet.mjs).
    {
      // Deprecated code is frozen in time; it is not held to new standards.
      files: ["archive/**"],
      rules: {
        "complexity": "off",
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
      // Long test functions are normal; app code is where the 200-line cap
      // bites (and 71 test offenders would just be baseline noise).
      files: ["test/**/*.{ts,tsx}", "e2e/**/*.{ts,tsx}"],
      rules: {
        "max-lines-per-function": "off",
      },
    },

    // Node
    {
      files: [".eslintrc.js"],
      env: {
        node: true,
      },
    },
  ],
};
