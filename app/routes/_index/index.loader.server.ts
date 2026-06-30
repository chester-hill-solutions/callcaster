import { getSession } from "@/lib/auth.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await getSession(request);
  const user = await adminDb.auth.getUser();
  return { user };
};
