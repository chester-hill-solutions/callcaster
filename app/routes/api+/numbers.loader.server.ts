import { data as routeData } from "react-router";
import { getDualAuthUser, requireDualAuth } from "@/lib/api-auth.server";
import {
  getNumberSearchNumberType,
  jsonNumbersSearchResponse,
  mapTwilioAvailableNumbers,
  parseNumberSearchRequest,
} from "@/lib/numbers-search.server";
import {
  createWorkspaceTwilioInstance,
  requireWorkspaceAccess,
} from "@/lib/database/workspace.server";
import { logger } from "@/lib/logger.server";

import { twilioErrorUserMessage } from "@/lib/twilio-errors";
import type Twilio from "twilio";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: ({ request }) => requireDualAuth(request),
  sideEffects: ["twilio", "db-read"],
  handler: async ({ url, auth }) => {
    const user = getDualAuthUser(auth);
    if (!user) {
      return routeData({ error: "Unauthorized" }, { status: 401 });
    }
    const parsed = parseNumberSearchRequest(url.searchParams);
    if (!parsed.ok) {
      return jsonNumbersSearchResponse({ ok: false, error: parsed.error }, 400);
    }

    const workspaceId = url.searchParams.get("workspace_id")?.trim();
    if (!workspaceId) {
      return jsonNumbersSearchResponse(
        { ok: false, error: "Workspace ID is required." },
        400,
      );
    }

    // Keep membership failures outside the provider error handler so a
    // non-member receives the same 404 as other workspace routes.
    await requireWorkspaceAccess({ user, workspaceId });

    try {
      const twilio = await createWorkspaceTwilioInstance({
        workspace_id: workspaceId,
      }) as Twilio.Twilio;

      const numberType = getNumberSearchNumberType(url.searchParams);
      const available = twilio.availablePhoneNumbers("CA");
      const numbers =
        numberType === "tollfree"
          ? await available.tollFree.list(
              parsed.listParams as Parameters<
                typeof available.tollFree.list
              >[0],
            )
          : await available.local.list(
              parsed.listParams as Parameters<
                typeof available.local.list
              >[0],
            );

      return jsonNumbersSearchResponse({
        ok: true,
        numbers: mapTwilioAvailableNumbers(numbers),
      });
    } catch (error) {
      logger.error("Fetching numbers failed", error);
      return jsonNumbersSearchResponse(
        {
          ok: false,
          error: twilioErrorUserMessage(error),
        },
        500,
      );
    }
  },
});
