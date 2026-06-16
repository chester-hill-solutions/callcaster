import { createSupabaseServerClient } from "@/lib/supabase.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabaseClient: supabase } = createSupabaseServerClient(request);
  const user = await supabase.auth.getUser();
  return { user };
};
