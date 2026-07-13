import { data as routeData } from "react-router";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  sideEffects: ["none"],
  handler: async () => {
    return routeData(
      { error: "Audio PIN verification has been retired. Use call-in verification instead." },
      { status: 410 },
    );
  },
});
