// Twilio not used in this endpoint
import { createClient } from "@supabase/supabase-js";
import { requireWorkspaceAccess, safeParseJson } from "@/lib/database.server";
import type { ActionFunctionArgs } from "@remix-run/node";
import { createErrorResponse } from "@/lib/errors.server";
import { logger } from "@/lib/logger.server";
import { env } from "@/lib/env.server";
import { verifyAuth } from "@/lib/supabase.server";

// unused types removed

interface UpdateWorkspaceParams {
  workspace_id: string;
  update: WorkspaceUpdate;
}

interface WorkspaceRequest {
  workspace_id: string;
  update?: WorkspaceUpdate;
}

interface WorkspaceUpdate {
  name?: string;
  description?: string;
  settings?: Record<string, unknown>;
  [key: string]: unknown;
}

// removed unused createSubaccount

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeWorkspaceUpdate(update: unknown): WorkspaceUpdate {
  if (!isRecord(update)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(update).filter(
      ([key, value]) =>
        value !== undefined &&
        key !== "__proto__" &&
        key !== "prototype" &&
        key !== "constructor",
    ),
  );
}

const updateWorkspace = async ({
  workspace_id,
  update,
}: UpdateWorkspaceParams) => {
  const supabase = createClient(env.SUPABASE_URL(), env.SUPABASE_SERVICE_KEY());
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspace")
    .select()
    .eq("id", workspace_id)
    .single();

  if (workspaceError) throw { workspace_error: workspaceError };

  if (Object.keys(update).length === 0) {
    return workspace;
  }

  const existingTwilioData = isRecord(workspace?.twilio_data)
    ? workspace.twilio_data
    : {};

  const { data, error } = await supabase
    .from("workspace")
    .update({ twilio_data: { ...existingTwilioData, ...update } })
    .eq("id", workspace_id)
    .select()
    .single();

  if (error) throw { workspace_error: error };
  return data;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabaseClient, user } = await verifyAuth(request);
  const { workspace_id, update }: WorkspaceRequest =
    await safeParseJson(request);

  if (!workspace_id || typeof workspace_id !== "string") {
    return createErrorResponse(
      new Error("workspace_id is required"),
      "Failed to update workspace",
    );
  }

  try {
    await requireWorkspaceAccess({
      supabaseClient,
      user,
      workspaceId: workspace_id,
    });
    const sanitizedUpdate = sanitizeWorkspaceUpdate(update);
    const updated = await updateWorkspace({
      workspace_id,
      update: sanitizedUpdate,
    });

    return new Response(JSON.stringify({ ...updated }), {
      headers: {
        "Content-Type": "application/json",
      },
      status: 200,
    });
  } catch (error) {
    logger.error("Subaccount failed", error);
    return createErrorResponse(error, "Failed to update workspace");
  }
};
