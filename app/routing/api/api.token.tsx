import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseServerClientWithSession } from "../../lib/supabase.server";
import { requireWorkspaceAccess } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { generateToken } from "@/lib/twilio-voice-token.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabaseClient: supabase, user } = await getSupabaseServerClientWithSession(request);
  const url = new URL(request.url);
  const workspace = url.searchParams.get("workspace") ?? "";

  if (!workspace) {
    return json({ error: "workspace is required" }, { status: 400 });
  }

  await requireWorkspaceAccess({
    supabaseClient: supabase,
    user,
    workspaceId: workspace,
  });

  const { data, error } = await supabase
    .from("workspace")
    .select("twilio_data, key, token")
    .eq("id", workspace)
    .single();

  if (error || !data) {
    return json({ error: "workspace not found" }, { status: 404 });
  }

  const twilioData = (data.twilio_data ?? {}) as Record<string, unknown>;
  const twilioAccountSid =
    typeof twilioData["sid"] === "string" ? (twilioData["sid"] as string) : "";
  const twilioApiKey = (data.key ?? "") as string;
  const twilioApiSecret = (data.token ?? "") as string;

  const voiceJwt = generateToken({
    twilioAccountSid,
    twilioApiKey,
    twilioApiSecret,
    identity: user.id,
  });
  logger.debug("Generated Twilio token");
  return json({ token: voiceJwt });
};
