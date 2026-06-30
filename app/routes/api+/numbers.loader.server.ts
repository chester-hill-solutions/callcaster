import { data as routeData } from "react-router";
import { getDualAuthUser, requireDualAuth } from "@/lib/api-auth.server";
import {
  getNumberSearchNumberType,
  jsonNumbersSearchResponse,
  mapTwilioAvailableNumbers,
  parseNumberSearchRequest,
} from "@/lib/numbers-search.server";
import { createWorkspaceTwilioInstance, requireWorkspaceAccess } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { createParentTwilioInstance } from "@/twilio.server";

import { twilioErrorUserMessage } from "@/lib/twilio-errors";
import type Twilio from "twilio";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const auth = await requireDualAuth(request);
  if (auth instanceof Response) return auth;
  const user = getDualAuthUser(auth);
  if (!user) {
    return routeData({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user) {
    return jsonNumbersSearchResponse({ ok: false, error: "Unauthorized." }, 401);
  }

  const url = new URL(request.url);
  const parsed = parseNumberSearchRequest(url.searchParams);
  if (!parsed.ok) {
    return jsonNumbersSearchResponse({ ok: false, error: parsed.error }, 400);
  }

  const workspaceId = url.searchParams.get("workspace_id")?.trim() || null;

  try {
    let twilio: Twilio.Twilio;
    if (workspaceId) {
      await requireWorkspaceAccess({ user,
        workspaceId,
      });
      twilio = (await createWorkspaceTwilioInstance({ workspace_id: workspaceId,
      })) as Twilio.Twilio;
    } else {
      // No workspace context (e.g. platform-admin search). Available-number
      // search is parent-scoped, so use a fresh parent-account client.
      twilio = createParentTwilioInstance();
    }

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
};
