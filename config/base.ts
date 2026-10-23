import type { ProjectConfig } from "./schema";

/** Non-secret defaults. Environment identity is supplied by an environment entry. */
export const baseProjectConfig = {
  runtime: { mode: "development" },
  urls: {},
  storage: {},
  services: {},
} satisfies {
  runtime: Partial<ProjectConfig["runtime"]>;
  urls: Partial<ProjectConfig["urls"]>;
  storage: Partial<ProjectConfig["storage"]>;
  services: Partial<ProjectConfig["services"]>;
};
