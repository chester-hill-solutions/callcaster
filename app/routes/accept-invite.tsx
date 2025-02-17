import { json } from "@remix-run/node";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  NavLink,
  useNavigate,
  useSubmit,
} from "@remix-run/react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import {
  AuthSession,
  EmailOtpType,
  SupabaseClient,
  User,
  VerifyTokenHashParams,
} from "@supabase/supabase-js";
import {
  createSupabaseServerClient,
  verifyAuth,
} from "~/lib/supabase.server";
import {
  acceptWorkspaceInvitations,
  getInvitesByUserId,
} from "~/lib/database.server";
import { Button } from "~/components/ui/button";
import { NewUserSignup } from "~/components/AcceptInvite/NewUserSignUp";
import { ExistingUserInvites } from "~/components/AcceptInvite/ExistingUserInvites";
import { toast, Toaster } from "sonner";
import { useEffect } from "react";

async function handleAuthenticatedUser(
  client: SupabaseClient,
  session: AuthSession,
  headers: Headers,
) {
  const { data: invites, error: inviteError } = await client
    .from("workspace_invite")
    .select(`*, workspace(id, name)`)
    .eq("user_id", session.user.id);
  if (inviteError) {
    throw inviteError.message;
  }
  if (
    session.user.user_metadata.first_name === "New" &&
    session.user.user_metadata.last_name === "Caller"
  ) {
    return json(
      {
        status: "verified",
        session,
        invites,
        email: session.user.email,
      },
      { headers },
    );
  } else
    return json(
      {
        status: "existing_user",
        session,
        invites,
        email: session.user.email,
      },
      {
        headers,
      },
    );
}

async function handleTokenVerification(
  client: SupabaseClient,
  token_hash: VerifyTokenHashParams["token_hash"],
  type: VerifyTokenHashParams["type"],
  email: string,
  headers: Headers,
) {
  try {
    const { data: verifyData, error: verifyError } =
      await client.auth.verifyOtp({ token_hash, type });
    if (verifyError || !verifyData.session) {
      if (
        (verifyError &&
          verifyError.message.includes(
            "Email link is invalid or has expired",
          )) ||
        !verifyData.session
      ) {
        return json(
          {
            status: "invalid_link",
            error:
              "The invitation link is invalid or has expired. Please request a new invitation.",
          },
          { headers },
        );
      }
      throw verifyError;
    }
    const { data: sessionData, error: setSessionError } =
      await client.auth.setSession({
        access_token: verifyData.session.access_token,
        refresh_token: verifyData.session.refresh_token,
      });
    if (setSessionError || !sessionData.session || !sessionData.user) {
      console.error("Set session error:", setSessionError);
      throw setSessionError;
    }
    await client.auth.refreshSession(sessionData.session);
    const invites = await getInvitesByUserId(client, sessionData.user.id);
    return json(
      {
        status: "verified",
        session: verifyData.session,
        email,
        invites,
      },
      { headers },
    );
  } catch (error) {
    console.error("Unhandled error", error);
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabaseClient, headers } = createSupabaseServerClient(request);
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  const url = new URL(request.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const email = url.searchParams.get("email");
  if (session) {
    return handleAuthenticatedUser(supabaseClient, session, headers);
    
  } else if (token_hash && type) {
    if (!email) throw new Error("No email address found.");
    return handleTokenVerification(
      supabaseClient,
      token_hash,
      type as EmailOtpType,
      email,
      headers,
    );
  } else {
    return json({ status: "not_signed_in" }, { headers });
  }
}

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
    const { supabaseClient, headers, user } =
      (await verifyAuth(request)) as {
        supabaseClient: SupabaseClient;
        headers: Headers;
        user: User;
      };
    const userId = user?.id;
    const invitationIds = formData.getAll("invitation_id") as string[];

    const { errors } = await acceptWorkspaceInvitations(
      supabaseClient,
      invitationIds,
      userId,
    );
    if (errors) return json({ errors }, { headers });
    return json({ success: true }, { headers });
  }

  return json({ error: "Invalid action type" }, { headers });
};

function VerifiedNewUser({ email, state, onSubmit }) {
  return <NewUserSignup email={email} state={state} onSubmit={onSubmit} />;
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
      const timeout = setTimeout(() => navigate("/workspaces"), 3000);

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
      <div className="flex flex-col items-center justify-center gap-5  rounded-md bg-brand-secondary px-28 py-8 shadow-lg dark:border-2 dark:border-white dark:bg-transparent dark:text-white dark:shadow-none">
        <h1 className="mb-4 font-Zilla-Slab text-3xl font-bold text-brand-primary  dark:text-white">
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
        {Boolean(loaderData.error) && <div>{loaderData.error}</div>}
      </div>
      <Toaster richColors />
    </main>
  );
}
