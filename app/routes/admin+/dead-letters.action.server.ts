import { data as routeData } from "react-router";
import { adminRouteAuth } from "@/lib/admin-route.server";
import { requeueDeadLetteredJob } from "@/lib/admin-jobs.server";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  auth: adminRouteAuth,
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {
    const formData = await request.formData();
    const jobId = Number(formData.get("jobId"));

    if (!Number.isInteger(jobId) || jobId <= 0) {
      return routeData({ error: "Invalid job id." }, { status: 400 });
    }

    const result = await requeueDeadLetteredJob(jobId, auth.user.id);

    if (!result.ok) {
      if (result.reason === "invalid_params") {
        return routeData(
          { error: `Job #${jobId} can't be requeued — its stored params no longer pass validation: ${result.error}` },
          { status: 422 },
        );
      }
      // Either the id is wrong or another admin already requeued it. Both mean
      // "no dead-lettered job with that id right now", which is what to say.
      return routeData(
        { error: `Job #${jobId} is not currently dead-lettered — it may already have been requeued.` },
        { status: 409 },
      );
    }

    return routeData({ requeuedJobId: result.jobId, message: `Job #${result.jobId} requeued.` });
  },
});
