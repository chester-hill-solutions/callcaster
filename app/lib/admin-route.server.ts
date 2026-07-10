import type { RouterContextProvider } from "react-router";
import { adminContext } from "@/lib/route-context.server";
import type { Database } from "@/lib/db-types";

type UserRow = Database["public"]["Tables"]["user"]["Row"];

export type AdminRouteContext = {
  user: { id: string };
  userData: UserRow;
  headers: Headers;
};

/** Read admin context set by layout middleware (required on `admin+/` children). */
export function getAdminRouteContext(
  context: Readonly<RouterContextProvider>,
): AdminRouteContext {
  const admin = context.get(adminContext);
  if (!admin) {
    throw new Error("Admin context missing");
  }
  return {
    user: { id: admin.userId },
    userData: admin.userData,
    headers: admin.headers,
  };
}
