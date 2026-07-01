import { getSession } from "@/lib/auth.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { user } = await getSession(request);
  return { user };
};
