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
        "import/no-duplicates": "off",
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
            "ts-ignore": "allow-with-description",
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
              {
                name: "@/lib/workspace-api-route.server",
                importNames: ["withWorkspaceApiLoader", "withWorkspaceApiAction"],
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

    // Node
    {
      files: [".eslintrc.js"],
      env: {
        node: true,
      },
    },
  ],
};
