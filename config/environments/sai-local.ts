import type { ProjectConfigOverlay } from "../schema";

export const saiLocalConfig = {
  environment: "sai-local",
  parent: "local",
} satisfies ProjectConfigOverlay;
