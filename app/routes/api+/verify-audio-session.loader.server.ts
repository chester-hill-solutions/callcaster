import { data as routeData } from "react-router";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  sideEffects: ["none"],
  handler: async () => {
    return routeData(
      { error: "Audio PIN verification has been retired. Use call-in verification instead." },
      { status: 410 },
    );
  },
});
