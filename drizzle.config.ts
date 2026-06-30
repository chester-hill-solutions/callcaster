import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: ["./app/db/schema.ts", "./app/db/auth-schema.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? process.env.BASE_URL ?? "",
  },
  verbose: true,
  strict: true,
});
