import { handleAcdRouterRequest } from "@/lib/acd/acd-router.server";
import type { ActionFunctionArgs } from "react-router";

/** Twilio ACD wait URL — default `/api/acd-router`. */
export const action = async ({ request }: ActionFunctionArgs) => {
  return handleAcdRouterRequest(request, "wait");
};
