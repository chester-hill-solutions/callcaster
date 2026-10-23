import type { ProjectConfigOverlay } from "../schema";

export const devConfig = {
  environment: "dev",
  runtime: { mode: "production" },
  urls: { publicApp: "https://dev.callcaster.ca" },
} satisfies ProjectConfigOverlay;
