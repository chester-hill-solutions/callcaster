import { defineLoader } from "@/lib/handler.server";
import { workspaceRouteAuth } from "@/lib/workspace-route.server";
import { downloadAudienceImportReport } from "@/lib/audience-import-download.server";

export const loader = defineLoader({
  auth: workspaceRouteAuth,
  sideEffects: ["db-read"],
  handler: async ({ params, auth }) => {
    const uploadId = Number(params.uploadId);
    if (params.id !== auth.workspaceId) throw new Response("Workspace not found", { status: 404 });
    if (!Number.isSafeInteger(uploadId) || uploadId < 1) throw new Response("Invalid upload ID", { status: 400 });
    const report = await downloadAudienceImportReport(auth.workspaceId, uploadId);
    if (!report) throw new Response("Import report not found", { status: 404 });
    return report;
  },
});
