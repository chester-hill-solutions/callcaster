import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  getAudienceUploadStatusApi,
} from "@/lib/platform-data.server";
import { dataPlaneCapabilityAuthWithParam } from "@/lib/capability-guard.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: (args) =>
    dataPlaneCapabilityAuthWithParam("campaigns.read", "uploadId")(args),
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    const result = await getAudienceUploadStatusApi(
      auth.workspaceId,
      auth.uploadId,
    );
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse(result.upload, 200);
  },
});
