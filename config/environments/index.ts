import { devConfig } from "./dev";
import { localConfig } from "./local";
import { productionConfig } from "./production";
import { qaConfig } from "./qa";
import { saiLocalConfig } from "./sai-local";

export const environmentConfigs = {
  local: localConfig,
  "sai-local": saiLocalConfig,
  dev: devConfig,
  qa: qaConfig,
  production: productionConfig,
} as const;
