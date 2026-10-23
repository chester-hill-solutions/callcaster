import type { ProjectConfigOverlay } from "../schema";

export const qaConfig = {
  environment: "qa",
  runtime: { mode: "production" },
  urls: { publicApp: "https://qa.callcaster.ca" },
  storage: { bucket: "callcaster-staging", region: "iad" },
} satisfies ProjectConfigOverlay;
