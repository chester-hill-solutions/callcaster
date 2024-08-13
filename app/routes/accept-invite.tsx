import { json } from "@remix-run/node";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  NavLink,
  useNavigate,
  Form,
  useLocation,
} from "@remix-run/react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { createClient, Session, SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabaseServerClient,
  getSupabaseServerClientWithSession,
} from "~/lib/supabase.server";
import { acceptWorkspaceInvitations } from "~/lib/database.server";
import { Button } from "~/components/ui/button";
import { ErrorAlert } from "~/components/AcceptInvite/ErrorAlert";
import { NewUserSignup } from "~/components/AcceptInvite/NewUserSignUp";
import { ExistingUserInvites } from "~/components/AcceptInvite/ExistingUserInvites";
import { toast, Toaster } from "sonner";
import { useEffect } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabaseClient, headers } = createSupabaseServerClient(request);
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  const url = new URL(request.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  if (session) {
    const { data: invites, error: inviteError } = await supabaseClient
      .from("workspace_invite")
      .select()
      .eq("user_id", session.user.id);
    if (inviteError) return json({ error: inviteError }, { headers });
    return json({ status: "existing_user", session, invites }, { headers });
  } else if (token_hash && type) {
    return json({ status: "new_user", token_hash, type }, { headers });
  } else {
    return json({ status: "not_signed_in" }, { headers });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabaseClient, headers } = createSupabaseServerClient(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  if (actionType === "signUpAndVerify") {
    const { email, password, firstName, lastName, token_hash, type } =
      Object.fromEntries(formData);

    try {
      const { data: verifyData, error: verifyError } =
        await supabaseClient.auth.verifyOtp({
          token_hash: token_hash as string,
          type: type as
            | "signup"
            | "invite"
            | "magiclink"
            | "recovery"
            | "email_change",
        });

      if (verifyError) throw verifyError;

      if (!verifyData.session) {
        throw new Error("Failed to verify OTP: No session returned");
      }
      const { data: newAuth, error: setSessionError } =
        await supabaseClient.auth.setSession(verifyData.session);
      if (setSessionError) throw setSessionError;
      
      headers.append("Set-Cookie", newAuth);
      const { data: userData, error: updateError } =
        await supabaseClient.auth.updateUser({
          email: email as string,
          password: password as string,
          data: { first_name: firstName, last_name: lastName },
        });

      if (updateError) throw updateError;
      const { data: invites, error: inviteError } = await supabaseClient
        .from("workspace_invite")
        .select()
        .eq("user_id", userData.user.id);

      if (inviteError) throw inviteError;

      return json(
        { status: "existing_user", session: verifyData.session, invites },
        { headers },
      );
    } catch (error) {
      console.error("Error in signUpAndVerify:", error);
      return json(
        { error: error.message || "An unexpected error occurred" },
        { headers },
      );
    }
  } else if (actionType === "acceptInvitations") {
    const { supabaseClient, headers, serverSession } =
      (await getSupabaseServerClientWithSession(request)) as {
        supabaseClient: SupabaseClient;
        headers: Headers;
        serverSession: Session;
      };
    const userId = serverSession?.user?.id;
    const invitationIds = formData.getAll("invitation_id") as string[];

    const { error } = await acceptWorkspaceInvitations(
      supabaseClient,
      invitationIds,
      userId,
    );
    if (error) return json({ error }, { headers });
    return json({ success: true }, { headers });
  }

  return json({ error: "Invalid action type" }, { headers });
};

export default function AcceptInvite() {
  const {
    session,
    invites,
    error: loaderError,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const { state } = useNavigation();
  const location = useLocation();
  const searchParams = new URLSearchParams(location?.search);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const email = searchParams.get("email");

  useEffect(() => {
    if (state === "idle" && actionData?.success) {
      toast.success("Successfully accepted invitations");
      const timeout = setTimeout(() => navigate("/workspaces"), 3000);
      return () => clearTimeout(timeout);
    }
  }, [actionData?.success, navigate, state]);

  return (
    <main className="mt-16 flex flex-col items-center justify-center text-slate-800 sm:w-full">
      <div className="flex flex-col items-center justify-center gap-5 rounded-md bg-brand-secondary px-28 py-8 shadow-lg dark:border-2 dark:border-white dark:bg-transparent dark:shadow-none">
        <h1 className="mb-4 font-Zilla-Slab text-3xl font-bold text-brand-primary dark:text-white">
          Accept your invitations
        </h1>
        <ErrorAlert error={loaderError || actionData?.error} />
        {!session ? (
          <NewUserSignup
            email={email}
            state={state}
            token_hash={token_hash}
            type={type}
          />
        ) : (
          <ExistingUserInvites invites={invites} state={state} />
        )}
        {!session && !token_hash && (
          <div className="flex flex-col gap-2">
            <p className="">Sign in to see your available invitations.</p>
            <Button asChild className="font-Zilla-Slab text-lg">
              <NavLink to={"/signin?next=/accept-invite"}>Sign in</NavLink>
            </Button>
          </div>
        )}
        {!invites?.length && session && (
          <div className="flex flex-col gap-2">
            <p>No new invitations.</p>
            <Button asChild>
              <NavLink to={"/workspaces"}>Workspaces</NavLink>
            </Button>
          </div>
        )}
      </div>
      <Toaster richColors />
    </main>
  );
}
