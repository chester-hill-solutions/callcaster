import { createSupabaseServerClient, verifyAuth } from "@/lib/supabase.server";
import { data as routeData, redirect } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {

  const { supabaseClient, headers } = await verifyAuth(request);
  const { data: serverSession } = await supabaseClient.auth.getSession();

  if (serverSession && serverSession.session) {
    return redirect("/workspaces", { headers });
  }
  return routeData({ serverSession }, { headers });
};

// Removed unused legacy styles

type FetcherData =
  | {
      success?: boolean;
    }
  | undefined;

type ActionData = {
  error: string;
};

export const action = async ({ request }: ActionFunctionArgs) => {

  const { headers } = createSupabaseServerClient(request);

  return routeData<ActionData>(
    {
      error:
        "Registration is invite-only. Please use your invitation link or request access through the contact form.",
    },
    { headers, status: 403 },
  );
}
