import { data as routeData } from "react-router";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  sideEffects: ["none"],
  handler: ({ url }) => {
    const token = url.searchParams.get("token") ?? null;
    // Better Auth's own callback redirects here with `?error=INVALID_TOKEN`
    // when the token is expired or unknown. Dropping it rendered a normal form
    // that could only fail on submit with the same message (#2075).
    const error = url.searchParams.get("error") ?? null;
    return routeData({ token, error });
  },
});
