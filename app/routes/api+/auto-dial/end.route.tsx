export { action } from "./end.action.server";

type AutoDialEndDeps = Partial<{
  verifyAuth: (request: Request) => Promise<{ supabaseClient: unknown; user: unknown }>;
  safeParseJson: (request: Request) => Promise<unknown>;
  createWorkspaceTwilioInstance: (args: {
    supabase: unknown;
    workspace_id: string;
  }) => Promise<unknown>;
  logger: { error: (...args: unknown[]) => void };
}>;

