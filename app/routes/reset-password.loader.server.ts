import { data as routeData } from "react-router";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  sideEffects: ["none"],
  handler: ({ url }) => {
    const token = url.searchParams.get("token") ?? null;
    return routeData({ token });
  },
});
