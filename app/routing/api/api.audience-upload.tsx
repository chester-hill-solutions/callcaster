import { json } from "@remix-run/node";
import { verifyAuth } from "@/lib/supabase.server";
import type { processAudienceUpload as ProcessAudienceUploadFn } from "@/lib/audience-upload-process.server";

export { isOtherDataArray, generateUniqueId } from "@/lib/audience-upload.shared";

type AudienceUploadDeps = Partial<{
  verifyAuth: typeof verifyAuth;
  processAudienceUpload: typeof ProcessAudienceUploadFn;
}>;

async function getProcessAudienceUpload(
  injected?: typeof ProcessAudienceUploadFn,
): Promise<typeof ProcessAudienceUploadFn> {
  if (injected) return injected;
  const m = await import("@/lib/audience-upload-process.server");
  return m.processAudienceUpload;
}

export const action = async ({
  request,
  deps,
}: {
  request: Request;
  deps?: AudienceUploadDeps;
}) => {
  const verifyFn = deps?.verifyAuth ?? verifyAuth;
  const { supabaseClient, headers, user } = await verifyFn(request);

  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401, headers });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers });
  }

  const formData = await request.formData();
  const workspaceId = formData.get("workspace_id") as string;
  const audienceName = formData.get("audience_name") as string;
  const audienceIdStr = formData.get("audience_id") as string;
  const contactsFile = formData.get("contacts") as File;
  const headerMapping = formData.get("header_mapping") as string;
  const splitNameColumn = formData.get("split_name_column") as string;

  if (!workspaceId) {
    return json({ error: "Workspace ID is required" }, { status: 400, headers });
  }

  if (!audienceIdStr && !audienceName) {
    return json(
      { error: "Either Audience ID or Audience name is required" },
      { status: 400, headers },
    );
  }

  if (!contactsFile) {
    return json({ error: "Contacts file is required" }, { status: 400, headers });
  }

  try {
    let finalAudienceId: number;

    if (audienceIdStr) {
      const audienceId = parseInt(audienceIdStr, 10);

      const { data: existingAudience, error: audienceCheckError } =
        await supabaseClient
          .from("audience")
          .select("id")
          .eq("id", audienceId)
          .eq("workspace", workspaceId)
          .single();

      if (audienceCheckError || !existingAudience) {
        return json(
          { error: "Audience not found or not accessible" },
          { status: 404, headers },
        );
      }

      finalAudienceId = audienceId;

      await supabaseClient
        .from("audience")
        .update({ status: "updating" })
        .eq("id", finalAudienceId);
    } else {
      const { data: audienceData, error: audienceError } = await supabaseClient
        .from("audience")
        .insert({
          name: audienceName,
          workspace: workspaceId,
          status: "pending",
        })
        .select()
        .single();

      if (audienceError) {
        return json({ error: audienceError.message }, { status: 500, headers });
      }

      finalAudienceId = audienceData.id;
    }

    const fileContent = await contactsFile.arrayBuffer();
    const fileContentText = new TextDecoder().decode(fileContent);
    const encoder = new TextEncoder();
    const utf8Bytes = encoder.encode(fileContentText);
    const fileBase64 = Buffer.from(utf8Bytes).toString("base64");

    const { data: uploadData, error: uploadError } = await supabaseClient
      .from("audience_upload")
      .insert({
        audience_id: finalAudienceId,
        workspace: workspaceId,
        created_by: user.id,
        status: "pending",
        file_name: contactsFile.name,
        file_size: contactsFile.size,
        total_contacts: 0,
        processed_contacts: 0,
        header_mapping: headerMapping ? JSON.parse(headerMapping) : {},
        split_name_column: splitNameColumn || null,
      })
      .select()
      .single();

    if (uploadError) {
      return json({ error: uploadError.message }, { status: 500, headers });
    }

    const uploadId = uploadData.id;
    const processAudienceUpload = await getProcessAudienceUpload(
      deps?.processAudienceUpload,
    );

    processAudienceUpload(
      supabaseClient,
      uploadId,
      finalAudienceId,
      workspaceId,
      user.id,
      fileBase64,
      headerMapping ? JSON.parse(headerMapping) : {},
      splitNameColumn || null,
    ).catch(async (error) => {
      const { logger } = await import("@/lib/logger.server");
      logger.error("Background processing error:", error);
    });

    return json(
      {
        success: true,
        audience_id: finalAudienceId,
        upload_id: uploadId,
        message: audienceIdStr
          ? "File upload started. Processing in background."
          : "Audience created and file upload started. Processing in background.",
      },
      { headers },
    );
  } catch (error) {
    const { logger } = await import("@/lib/logger.server");
    logger.error("Upload request error:", error);
    return json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers },
    );
  }
};
