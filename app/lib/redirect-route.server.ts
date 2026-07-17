import { data as routeData, redirect } from "react-router";

/** Handler body for a legacy route that permanently forwards to `target`. */
export function redirectTo(target: string) {
  return () => redirect(target);
}

/** Handler body for a retired endpoint: 410 Gone with a replacement hint. */
export function retiredEndpoint(message: string) {
  return () => routeData({ error: message }, { status: 410 });
}
