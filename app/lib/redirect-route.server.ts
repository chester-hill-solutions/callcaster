import { redirect } from "react-router";

/** Handler body for a legacy route that permanently forwards to `target`. */
export function redirectTo(target: string) {
  return () => redirect(target);
}
