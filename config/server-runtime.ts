import { loadProjectConfig } from "./load";
import { EnvironmentNameSchema } from "./schema";

/** Server process boundary: the environment selector is read once and all consumers receive typed config. */
const requestedEnvironment =
  process.env.NODE_ENV === "production" ||
  process.env.RAILWAY_ENVIRONMENT_NAME !== undefined ||
  process.env.RAILWAY_PROJECT_ID !== undefined ||
  process.env.RAILWAY_ENVIRONMENT_ID !== undefined ||
  process.env.RAILWAY_SERVICE_ID !== undefined ||
  process.env.RAILWAY_DEPLOYMENT_ID !== undefined
    ? "production"
    : EnvironmentNameSchema.parse(process.env.ENV ?? "local");
export const serverProjectConfig = loadProjectConfig(requestedEnvironment);
export const checkoutProvider =
  serverProjectConfig.services.app.checkoutProvider;
