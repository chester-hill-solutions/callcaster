export { action } from "./audiodrop.action.server";

type AudiodropDeps = Partial<{
  verifyAuth: (request: Request) => Promise<{ supabaseClient: unknown }>;
  createWorkspaceTwilioInstance: (args: {
    supabase: unknown;
    workspace_id: string;
  }) => Promise<unknown>;
}>;

