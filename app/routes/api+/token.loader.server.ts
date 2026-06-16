export { generateToken } from "@/lib/twilio-token.server";

import { data as routeData } from "react-router";
import { getSupabaseServerClientWithSession } from "@/lib/supabase.server";
import { logger } from "@/lib/logger.server";
import { requireWorkspaceAccess } from "@/lib/database.server";
import { generateToken } from "@/lib/twilio-token.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabaseClient: supabase, user } = await getSupabaseServerClientWithSession(request);
  const url = new URL(request.url);
  const workspace = url.searchParams.get("workspace") ?? "";

  if (!workspace) {
    return routeData({ error: "workspace is required" }, { status: 400 });
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
    return routeData({ error: "workspace not found" }, { status: 404 });
  }

  const twilioData = (data.twilio_data ?? {}) as Record<string, unknown>;
  const twilioAccountSid = typeof twilioData["sid"] === "string" ? twilioData["sid"] : "";
  const twilioApiKey = (data.key ?? "") as string;
  const twilioApiSecret = (data.token ?? "") as string;

  const token = await generateToken({
    twilioAccountSid,
    twilioApiKey,
    twilioApiSecret,
    identity: user.id,
  });

  logger.debug("Generated Twilio token");
  return routeData({ token });
};
