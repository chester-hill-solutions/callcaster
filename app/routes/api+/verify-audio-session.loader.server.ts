import { defineLoader } from "@/lib/handler.server";
import { retiredEndpoint } from "@/lib/redirect-route.server";

export const loader = defineLoader({
  sideEffects: ["none"],
  handler: retiredEndpoint(
    "Audio PIN verification has been retired. Use call-in verification instead.",
  ),
});
