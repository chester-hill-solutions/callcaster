import { workspaceRouteAuth } from "@/lib/workspace-route.server";
import {
  Audience,
  WorkspaceData,
  WorkspaceNumbers,
  Campaign,
} from "@/lib/types";
import { redirect } from "react-router";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: workspaceRouteAuth,
  sideEffects: ["none"],
  handler: async () => {
    return null;
  },
});
