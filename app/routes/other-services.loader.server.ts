import { defineAction, defineLoader } from "@/lib/handler.server";
import { redirectTo } from "@/lib/redirect-route.server";

export const loader = defineLoader({
  sideEffects: ["none"],
  handler: redirectTo("/services"),
});

export const action = defineAction({
  sideEffects: ["none"],
  handler: redirectTo("/services"),
});
