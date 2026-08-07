import { defineRailway, project } from "railway/iac";
import { devResources } from "./environments/dev.js";
import { productionResources } from "./environments/production.js";

export default defineRailway((ctx) => {
  const resources = ctx.isEnvironment("production")
    ? productionResources()
    : devResources();

  return project("CallCaster", { resources });
});
