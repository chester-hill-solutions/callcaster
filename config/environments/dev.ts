import type { ProjectConfigOverlay } from "../schema";

export const devConfig = {
  environment: "dev",
  emailDomain: "callcaster.ca",
  runtime: { mode: "production" },
  services: { app: { checkoutProvider: "stripe" }, sim: { trafficPolicy: "paid-test-only" } },
  urls: { publicApp: "https://dev.callcaster.ca" },
  storage: { bucket: "callcaster-dev", region: "iad" },
} satisfies ProjectConfigOverlay;
