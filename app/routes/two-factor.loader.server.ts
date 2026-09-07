import { data as routeData, redirect } from "react-router";
import { isTwoFactorFeatureEnabled } from "@/lib/env.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  sideEffects: ["none"],
  handler: ({ url }) => {
    if (!isTwoFactorFeatureEnabled()) {
      throw redirect("/workspaces");
    }
    const methods = (url.searchParams.get("methods") ?? "totp").split(",");
    const next = url.searchParams.get("next");
    return routeData({ methods, next });
  },
});
