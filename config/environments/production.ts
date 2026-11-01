import type { ProjectConfigOverlay } from "../schema";

export const productionConfig = {
  environment: "production",
  emailDomain: "callcaster.ca",
  runtime: { mode: "production" },
  services: { sim: { trafficPolicy: "disabled" } },
  urls: { publicApp: "https://app.callcaster.ca" },
  storage: { bucket: "callcaster-production", region: "iad" },
} satisfies ProjectConfigOverlay;
