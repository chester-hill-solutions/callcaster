import type { ActionFunctionArgs } from "@remix-run/node";

export const action = async (args: ActionFunctionArgs) => {
  const { action: runAction } = await import("@/lib/api-auto-dial-dialer.server");
  return runAction(args);
};
