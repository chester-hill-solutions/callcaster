import { data as routeData } from "react-router";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  sideEffects: ["none"],
  handler: ({ url }) => {
    const methods = (url.searchParams.get("methods") ?? "totp").split(",");
    const next = url.searchParams.get("next");
    return routeData({ methods, next });
  },
});
