import { data as routeData } from "react-router";
import { defineLoader } from "@/lib/handler.server";

export type ResetPasswordLoaderData = {
  token: string | null;
  /**
   * Better Auth's callback error code, `INVALID_TOKEN` when the token is expired,
   * unknown, or already used. Any other value is not an unusable-link signal.
   */
  error: string | null;
};

export const loader = defineLoader({
  sideEffects: ["none"],
  handler: ({ url }) => {
    const token = url.searchParams.get("token") ?? null;
    // Better Auth's own callback redirects here with `?error=INVALID_TOKEN`
    // when the token is expired or unknown. Dropping it rendered a normal form
    // that could only fail on submit with the same message (#2075).
    const error = url.searchParams.get("error") ?? null;
    const result: ResetPasswordLoaderData = { token, error };
    return routeData(result);
  },
});
