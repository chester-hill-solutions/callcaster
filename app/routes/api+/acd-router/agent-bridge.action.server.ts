import { handleAcdRouterRequest } from "@/lib/acd/acd-router.server";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {
  return handleAcdRouterRequest(request, "agent-bridge");
};
