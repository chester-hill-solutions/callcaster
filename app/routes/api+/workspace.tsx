export { action } from "./workspace.action.server";

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
  const { env } = await import("@/lib/env.server");
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

