import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data as routeData, Form, redirect, useActionData, useFetcher, useNavigate, useNavigation } from "react-router";
import { FaGithub } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { data as routeData, redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { createSupabaseServerClient, verifyAuth } from "@/lib/supabase.server";

type ActionData =
  | {
      emailError: string | null;
      passwordError: string | null;
      error?: undefined;
      data?: undefined;
    }
  | {
      passwordError: string;
      emailError?: null;
      error?: undefined;
      data?: undefined;
    }
  | { error: string; emailError?: null; passwordError?: null; data?: undefined }
  | { data: unknown; error: null; emailError?: null; passwordError?: null };

export const loader = async ({ request }: LoaderFunctionArgs) => {

  const { supabaseClient, headers } = await verifyAuth(request);
  const { data: serverSession } = await supabaseClient.auth.getSession();

  if (serverSession && serverSession.session) {
    return redirect("/workspaces", { headers });
  }
  return routeData({ serverSession }, { headers });
}
