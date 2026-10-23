import type { ProjectConfigOverlay } from "../schema";

export const productionConfig = {
  environment: "production",
  runtime: { mode: "production" },
  urls: { publicApp: "https://app.callcaster.ca" },
} satisfies ProjectConfigOverlay;
