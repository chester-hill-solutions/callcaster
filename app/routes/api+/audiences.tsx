export { loader } from "./audiences.loader.server";
export { action } from "./audiences.action.server";

interface SupabaseResponse {
    supabaseClient: SupabaseClient<Database>;
    headers: Headers;
}

interface OtherDataItem {
    key: string;
    value: string | number | boolean;
}

interface AudienceData {
    id: number;
    [key: string]: string | number | boolean | null | undefined;
}

type AudiencesDeps = {
  verifyAuth: (request: Request) => Promise<{ supabaseClient: SupabaseResponse["supabaseClient"]; headers: Headers; user?: any }>;
  parseActionRequest: (request: Request) => Promise<Record<string, unknown>>;
  requireWorkspaceAccess: (args: unknown) => Promise<void>;
};

