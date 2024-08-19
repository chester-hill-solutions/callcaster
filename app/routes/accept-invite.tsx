import { json } from "@remix-run/node";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  NavLink,
  useNavigate,
  Form,
  useLocation,
  useSubmit,
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
  const email = url.searchParams.get("email");

  if (session) {
    const { data: invites, error: inviteError } = await supabaseClient
      .from("workspace_invite")
      .select()
      .eq("user_id", session.user.id);
    if (inviteError) return json({ error: inviteError }, { headers });
    
    if (
      session.user.user_metadata.first_name === "New" &&
      session.user.user_metadata.last_name === "Caller"
    ) {
      return json({ 
        status: "verified", 
        session, 
        invites, 
        email: email || session.user.email,
      }, { headers });
    } else {
      return json({ status: "existing_user", session, invites }, { headers });
    }
  } else if (token_hash && type) {
    try {
      const { data: verifyData, error: verifyError } =
        await supabaseClient.auth.verifyOtp({
          token_hash,
          type: type as "signup" | "invite" | "magiclink" | "recovery" | "email_change",
        });

      if (verifyError) {
        if (verifyError.message.includes("Email link is invalid or has expired")) {
          return json({ 
            status: "invalid_link", 
            error: "The invitation link is invalid or has expired. Please request a new invitation."
          }, { headers });
        }
        throw verifyError;
      }

      if (!verifyData.session) {
        throw new Error("Failed to verify OTP: No session returned");
      }
      const { error: setSessionError } = await supabaseClient.auth.setSession(verifyData.session);
      if (setSessionError) throw setSessionError;

      const { data: invites, error: inviteError } = await supabaseClient
        .from("workspace_invite")
        .select()
        .eq("user_id", verifyData.session.user.id);
      if (inviteError) throw inviteError;

      return json(
        { 
          status: "verified", 
          session: verifyData.session, 
          invites, 
          email
        },
        { headers },
      );
    } catch (error) {
      console.error("Error in verifyOtp:", error);
      return json(
        { status: "error", error: error.message || "An unexpected error occurred" },
        { headers },
      );
    }
  } else {
    return json({ status: "not_signed_in" }, { headers });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabaseClient, headers } = createSupabaseServerClient(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");
  
  if (actionType === "updateUser") {
    try {
      const { email, password, firstName, lastName } =
        Object.fromEntries(formData);

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

      return json({ status: "updated", invites }, { headers });
    } catch (error) {
      console.error("Error in updateUser:", error);
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

function VerifiedNewUser({ email, state, onSubmit }) {
  return (
    <NewUserSignup
      email={email}
      state={state}
      onSubmit={onSubmit}
    />
  );
}

function ExistingUser({ invites, state }) {
  if (!invites?.length) {
    return (
      <div className="flex flex-col gap-2">
        <p>No new invitations.</p>
        <Button asChild>
          <NavLink to="/workspaces">Workspaces</NavLink>
        </Button>
      </div>
    );
  }
  return <ExistingUserInvites invites={invites} state={state} />;
}

function NotSignedIn() {
  return (
    <div className="flex flex-col gap-2">
      <p className="">Sign in to see your available invitations.</p>
      <Button asChild className="font-Zilla-Slab text-lg">
        <NavLink to="/signin?next=/accept-invite">Sign in</NavLink>
      </Button>
    </div>
  );
}

export default function AcceptInvite() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const { state } = useNavigation();
  const submit = useSubmit();
  
  useEffect(() => {
    if (state === "idle" && actionData?.success) {
      toast.success("Successfully signed up and accepted invitation");
      const timeout = setTimeout(() => null, 3000);
      return () => clearTimeout(timeout);
    }
  }, [actionData, navigate, state]);

  const handleUpdateUser = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.append("actionType", "updateUser");
    submit(formData, { method: "post" });
  };

  return (
    <main className="mt-16 flex flex-col items-center justify-center text-slate-800 sm:w-full">
      <div className="flex flex-col items-center justify-center gap-5 rounded-md bg-brand-secondary px-28 py-8 shadow-lg dark:border-2 dark:border-white dark:bg-transparent dark:shadow-none">
        <h1 className="mb-4 font-Zilla-Slab text-3xl font-bold text-brand-primary dark:text-white">
          Accept your invitations
        </h1>
        {loaderData.status === "verified" && (
          <VerifiedNewUser
            email={loaderData.email}
            state={state}
            onSubmit={handleUpdateUser}
          />
        )}
        {loaderData.status === "existing_user" && (
          <ExistingUser invites={loaderData.invites} state={state} />
        )}
        {loaderData.status === "not_signed_in" && <NotSignedIn />}
      </div>
      <Toaster richColors />
    </main>
  );
}
