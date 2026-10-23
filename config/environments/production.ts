import type { ProjectConfigOverlay } from "../schema";

export const productionConfig = {
  environment: "production",
  runtime: { mode: "production" },
  urls: { publicApp: "https://app.callcaster.ca" },
  storage: { bucket: "callcaster-production", region: "iad" },
} satisfies ProjectConfigOverlay;
