import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: "./openapi/public-api.json",
  output: "./app/lib/api-generated",
  plugins: [
    "@hey-api/typescript",
    "zod",
    "@hey-api/client-fetch",
    "@hey-api/sdk",
  ],
});
