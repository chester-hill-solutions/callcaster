export { action } from "./auto-dial.action.server";

type AutoDialDeps = Partial<{
  createSupabaseServerClient: (request: Request) => { supabaseClient: unknown };
  safeParseJson: <T>(request: Request) => Promise<T>;
  createWorkspaceTwilioInstance: (args: {
    supabase: unknown;
    workspace_id: string;
  }) => Promise<unknown>;
  requireWorkspaceAccess: (args: unknown) => Promise<void>;
  getAuthenticatedUser: (supabase: unknown) => Promise<{ id: string } | null>;
  env: { BASE_URL: () => string };
  logger: { error: (...args: unknown[]) => void };
}>;

async function defaultGetAuthenticatedUser(
  supabase: unknown,
): Promise<{ id: string } | null> {
  const authClient = (
    supabase as { auth?: { getUser?: () => Promise<unknown> } }
  ).auth;
  if (!authClient?.getUser) {
    return null;
  }

  const result = (await authClient.getUser()) as {
    data?: { user?: { id?: string } | null };
    error?: unknown;
  };

  const userId = result.data?.user?.id;
  if (typeof userId !== "string" || !userId) {
    return null;
  }

  return { id: userId };
}

function buildPendingCallSid(): string {
  const randomSuffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;

  return `pending-auto-dial-${randomSuffix}`;
}

