import {
  jsonNumbersSearchResponse,
  mapTwilioAvailableNumbers,
  parseNumberSearchRequest,
} from "@/lib/numbers-search.server";
import { createWorkspaceTwilioInstance, requireWorkspaceAccess } from "@/lib/database.server";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/supabase.server";
import { twilioErrorUserMessage } from "@/lib/twilio-errors";
import Twilio from "twilio";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabaseClient, user } = await verifyAuth(request);
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
      await requireWorkspaceAccess({
        supabaseClient,
        user,
        workspaceId,
      });
      twilio = (await createWorkspaceTwilioInstance({
        supabase: supabaseClient,
        workspace_id: workspaceId,
      })) as Twilio.Twilio;
    } else {
      twilio = new Twilio.Twilio(env.TWILIO_SID(), env.TWILIO_AUTH_TOKEN());
    }

    const locals = await twilio.availablePhoneNumbers("CA").local.list(
      parsed.listParams as Parameters<
        ReturnType<typeof twilio.availablePhoneNumbers>["local"]["list"]
      >[0],
    );

    return jsonNumbersSearchResponse({
      ok: true,
      numbers: mapTwilioAvailableNumbers(locals),
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
