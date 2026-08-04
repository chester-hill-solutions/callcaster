import { listWorkspaceAudiencesApi } from "@/lib/platform-data.server";
import { defineDataPlaneListLoader } from "@/lib/capability-guard.server";

export const loader = defineDataPlaneListLoader({
  capability: "campaigns.read",
  key: "audiences",
  list: listWorkspaceAudiencesApi,
});
