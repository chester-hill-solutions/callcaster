import {
  endHandsetSession,
  getHandsetLoaderData,
} from "@/lib/handset/handset-session.server";
import { verifyAuth } from "@/lib/supabase.server";
import { data as routeData } from "react-router";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { supabaseClient, headers, user } = await verifyAuth(request);
  const workspaceId = params.id;

  if (!workspaceId || !user) {
    return routeData({ error: "Unauthorized" }, { headers, status: 401 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "start_listening") {
    const handset = await getHandsetLoaderData({
      supabaseClient,
      user,
      workspaceId,
    });

    if (!handset.handsetNumber) {
      return routeData(
        {
          error:
            "No handset-enabled workspace number is available. Enable handset on a number in settings.",
        },
        { headers, status: 400 },
      );
    }

    return routeData(
      {
        listening: true,
        token: handset.token,
        tokenError: handset.tokenError,
        handsetNumber: handset.handsetNumber,
        clientIdentity: handset.clientIdentity,
      },
      { headers },
    );
  }

  if (intent === "stop_listening") {
    await endHandsetSession({ workspaceId, userId: user.id });
    return routeData({ listening: false }, { headers });
  }

  return routeData({ error: "Unknown intent" }, { headers, status: 400 });
};

export type CallLogActionData = {
  listening?: boolean;
  token?: string | null;
  tokenError?: string | null;
  handsetNumber?: string | null;
  clientIdentity?: string;
  error?: string;
};
