import type { ProjectConfigOverlay } from "../schema";

export const devConfig = {
  environment: "dev",
  runtime: { mode: "production" },
  urls: { publicApp: "https://dev.callcaster.ca" },
  storage: { bucket: "callcaster-dev", region: "iad" },
} satisfies ProjectConfigOverlay;
