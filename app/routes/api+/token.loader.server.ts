import { data as routeData } from "react-router";
import { requireJsonAuth } from "@/lib/api-auth.server";
import { requireWorkspaceAccess } from "@/lib/database.server";
import { createErrorResponse } from "@/lib/errors.server";
import { generateToken } from "@/lib/twilio-token.server";
import { logger } from "@/lib/logger.server";
import { getWorkspaceById } from "@/lib/workspace-members-db.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const workspace = url.searchParams.get("workspace") ?? "";

  if (!workspace) {
    return routeData({ error: "workspace is required" }, { status: 400 });
  }

  try {
    await requireWorkspaceAccess({
      user: auth.user,
      workspaceId: workspace,
    });

    const data = await getWorkspaceById(workspace);

    if (!data) {
      return routeData({ error: "workspace not found" }, { status: 404 });
    }

    const twilioData = (data.twilio_data ? JSON.parse(data.twilio_data) : {}) as Record<string, unknown>;
    const twilioAccountSid =
      typeof twilioData["sid"] === "string" ? twilioData["sid"] : "";
    const twilioApiKey = (data.key ?? "") as string;
    const twilioApiSecret = (data.token ?? "") as string;

    const token = await generateToken({
      twilioAccountSid,
      twilioApiKey,
      twilioApiSecret,
      identity: auth.user.id,
    });

    logger.debug("Generated Twilio token");
    return routeData({ token });
  } catch (error) {
    return createErrorResponse(error, "Failed to generate Twilio token");
  }
};
