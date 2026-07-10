import { getWorkspaceRouteContext } from "@/lib/workspace-route.server";
import {
  Audience,
  WorkspaceData,
  WorkspaceNumbers,
  Campaign,
} from "@/lib/types";
import { redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ context }: LoaderFunctionArgs) => {
  getWorkspaceRouteContext(context);
  return null;
};
