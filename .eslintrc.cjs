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
      },
    },
    {
      files: ["**/*.{js,jsx,ts,tsx}"],
      rules: {
        "react-hooks/exhaustive-deps": "off",
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
