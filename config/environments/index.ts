import { devConfig } from "./dev";
import { localConfig } from "./local";
import { productionConfig } from "./production";
import { qaConfig } from "./qa";

export const environmentConfigs = {
  local: localConfig,
  dev: devConfig,
  qa: qaConfig,
  production: productionConfig,
} as const;
