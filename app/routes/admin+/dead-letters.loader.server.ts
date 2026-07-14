import { data as routeData } from "react-router";
import { listRecentDeadLetteredJobs } from "@/lib/admin-jobs.server";
import { adminRouteAuth } from "@/lib/admin-route.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: adminRouteAuth,
  sideEffects: ["db-read"],
  handler: async () => {
    const jobs = await listRecentDeadLetteredJobs(100);
    return routeData({ jobs });
  },
});
