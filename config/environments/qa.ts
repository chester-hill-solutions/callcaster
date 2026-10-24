import type { ProjectConfigOverlay } from "../schema";

export const qaConfig = {
  environment: "qa",
  emailDomain: "callcaster.ca",
  runtime: { mode: "production" },
  services: { sim: { trafficPolicy: "paid-test-only" } },
  urls: { publicApp: "https://qa.callcaster.ca" },
  storage: { bucket: "callcaster-staging", region: "iad" },
} satisfies ProjectConfigOverlay;
