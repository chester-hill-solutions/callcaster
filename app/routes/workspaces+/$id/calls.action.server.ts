import { workspaceRouteAuth } from "@/lib/workspace-route.server";
import {
  endHandsetSession,
  getHandsetLoaderData,
} from "@/lib/handset/handset-session.server";
import { data as routeData } from "react-router";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  auth: workspaceRouteAuth,
  sideEffects: ["db-read", "db-write"],
  handler: async ({ request, auth }) => {
    const { headers, user, workspaceId, userRole } = auth;

    if (!workspaceId || !user) {
      return routeData({ error: "Unauthorized" }, { headers, status: 401 });
    }

    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent === "start_listening") {
      const handset = await getHandsetLoaderData({
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
  },
});

export type CallLogActionData = {
  listening?: boolean;
  token?: string | null;
  tokenError?: string | null;
  handsetNumber?: string | null;
  clientIdentity?: string;
  error?: string;
};
