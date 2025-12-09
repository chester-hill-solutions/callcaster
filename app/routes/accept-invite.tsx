import { json } from "@remix-run/node";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  NavLink,
  useNavigate,
} from "@remix-run/react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import type {
  SupabaseClient,
  User,
  VerifyTokenHashParams,
  Session,
} from "@supabase/supabase-js";
import { EmailOtpType } from "@supabase/supabase-js";
import {
  createSupabaseServerClient,
  verifyAuth,
} from "~/lib/supabase.server";
import {
  acceptWorkspaceInvitations,
  getInvitesByUserId,
} from "~/lib/database.server";
import { Button } from "~/components/ui/button";
import { NewUserSignup } from "~/components/invite/AcceptInvite/NewUserSignUp";
import { ExistingUserInvites } from "~/components/invite/AcceptInvite/ExistingUserInvites";
import { toast, Toaster } from "sonner";
import { useEffect } from "react";
import type { Database } from "~/lib/database.types";

type WorkspaceInviteRow = Database["public"]["Tables"]["workspace_invite"]["Row"];
type WorkspaceRow = Database["public"]["Tables"]["workspace"]["Row"];
type ExistingUserInvite = Omit<WorkspaceInviteRow, "workspace"> & {
  workspace: Pick<WorkspaceRow, "id" | "name">;
};
type LoaderData =
  | {
      status: "verified";
      invites: WorkspaceInviteRow[];
      email: string;
    }
  | {
      status: "existing_user";
      invites: ExistingUserInvite[];
      email: string;
    }
  | {
      status: "invalid_link";
      error: string;
    }
  | {
      status: "not_signed_in";
    }
  | {
      status: "error";
      error: string;
    };
type AcceptInvitationError = {
  invitationId: unknown;
  type: string;
};
type ActionData =
  | {
      status: "updated";
      invites: WorkspaceInviteRow[];
    }
  | {
      status: "accepted";
    }
  | {
      status: "accept_failed";
      errors: AcceptInvitationError[];
    }
  | {
      status: "error";
      error: string;
    };
type NavigationState = ReturnType<typeof useNavigation>["state"];

type RawInviteWithWorkspace = Omit<WorkspaceInviteRow, "workspace"> & {
  workspace:
    | (Pick<WorkspaceRow, "id" | "name"> & {
        name: WorkspaceRow["name"] | null;
      })
    | null;
};

async function fetchInvitesWithWorkspace(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<ExistingUserInvite[]> {
  const { data, error } = await client
    .from("workspace_invite")
    .select(`*, workspace(id, name)`)
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  const invitesWithWorkspace = (data ?? []) as RawInviteWithWorkspace[];

  return invitesWithWorkspace
    .filter(
      (invite): invite is RawInviteWithWorkspace & {
        workspace: NonNullable<RawInviteWithWorkspace["workspace"]>;
      } => invite.workspace !== null,
    )
    .map((invite) => ({
      ...invite,
      workspace: {
        id: invite.workspace.id,
        name: invite.workspace.name ?? "Unnamed workspace",
      },
    }));
}

async function handleAuthenticatedUser(
  client: SupabaseClient<Database>,
  session: Session,
  headers: Headers,
) {
  const email = session.user.email ?? "";
  const isNewUser =
    session.user.user_metadata.first_name === "New" &&
    session.user.user_metadata.last_name === "Caller";

  if (isNewUser) {
    const invites =
      ((await getInvitesByUserId(client, session.user.id)) as WorkspaceInviteRow[] | null) ?? [];
    return json<LoaderData>(
      {
        status: "verified",
        invites,
        email,
      },
      { headers },
    );
  }

  const invites = await fetchInvitesWithWorkspace(client, session.user.id);

  return json<LoaderData>(
      {
        status: "existing_user",
        invites,
      email,
      },
    { headers },
    );
}

async function handleTokenVerification(
  client: SupabaseClient<Database>,
  token_hash: VerifyTokenHashParams["token_hash"],
  type: VerifyTokenHashParams["type"],
  email: string,
  headers: Headers,
) {
  try {
    const { data: verifyData, error: verifyError } = await client.auth.verifyOtp({
      token_hash,
      type,
    });

    if (verifyError || !verifyData.session) {
      if (
        (verifyError &&
          verifyError.message.includes("Email link is invalid or has expired")) ||
        !verifyData.session
      ) {
        return json<LoaderData>(
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

    const { data: sessionData, error: setSessionError } = await client.auth.setSession({
        access_token: verifyData.session.access_token,
        refresh_token: verifyData.session.refresh_token,
      });

    if (setSessionError || !sessionData.session || !sessionData.user) {
      throw setSessionError ?? new Error("Unable to establish session");
    }

    await client.auth.refreshSession(sessionData.session);

    const isNewUser =
      sessionData.user.user_metadata.first_name === "New" &&
      sessionData.user.user_metadata.last_name === "Caller";

    if (isNewUser) {
      const invites =
        ((await getInvitesByUserId(client, sessionData.user.id)) as
          | WorkspaceInviteRow[]
          | null) ?? [];
      return json<LoaderData>(
      {
        status: "verified",
          email,
          invites,
        },
        { headers },
      );
    }

    const invites = await fetchInvitesWithWorkspace(client, sessionData.user.id);

    return json<LoaderData>(
      {
        status: "existing_user",
        email,
        invites,
      },
      { headers },
    );
  } catch (error) {
    console.error("Unhandled error during token verification", error);
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred while verifying.";
    return json<LoaderData>(
      {
        status: "error",
        error: message,
      },
      { headers, status: 500 },
    );
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
    return handleAuthenticatedUser(
      supabaseClient,
      session,
      headers,
    );
  }

  if (token_hash && type) {
    if (!email) throw new Error("No email address found.");
    return handleTokenVerification(supabaseClient, token_hash, type as EmailOtpType, email, headers);
  }

  return json<LoaderData>({ status: "not_signed_in" }, { headers });
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabaseClient, headers } = createSupabaseServerClient(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  if (actionType === "updateUser") {
    try {
      const entries = Object.fromEntries(formData.entries()) as Record<
        string,
        FormDataEntryValue
      >;

      const emailValue = entries.email;
      const passwordValue = entries.password;
      const firstNameValue = entries.firstName;
      const lastNameValue = entries.lastName;

      if (
        typeof emailValue !== "string" ||
        typeof passwordValue !== "string" ||
        typeof firstNameValue !== "string" ||
        typeof lastNameValue !== "string"
      ) {
        return json<ActionData>(
          {
            status: "error",
            error: "Invalid form submission.",
          },
          { headers, status: 400 },
        );
      }

      const { data: userData, error: updateError } = await supabaseClient.auth.updateUser({
        email: emailValue,
        password: passwordValue,
        data: { first_name: firstNameValue, last_name: lastNameValue },
        });

      if (updateError) throw updateError;
      if (!userData?.user) {
        throw new Error("Unable to retrieve updated user.");
      }

      const { data: invites, error: inviteError } = await supabaseClient
        .from("workspace_invite")
        .select()
        .eq("user_id", userData.user.id);

      if (inviteError) throw inviteError;

      return json<ActionData>(
        { status: "updated", invites: invites ?? [] },
        { headers },
      );
    } catch (error) {
      console.error("Error in updateUser:", error);
      const message =
        error instanceof Error ? error.message : "An unexpected error occurred";
      return json<ActionData>(
        { status: "error", error: message },
        { headers, status: 500 },
      );
    }
  } else if (actionType === "acceptInvitations") {
    const authContext = (await verifyAuth(request)) as {
      supabaseClient: SupabaseClient<Database>;
        headers: Headers;
        user: User;
      };

    const invitationIds = formData
      .getAll("invitation_id")
      .map((value) => (typeof value === "string" ? value : ""))
      .filter((value): value is string => Boolean(value));

    if (invitationIds.length === 0) {
      return json<ActionData>(
        {
          status: "error",
          error: "No invitations were selected.",
        },
        { headers: authContext.headers, status: 400 },
      );
    }

    const result = await acceptWorkspaceInvitations(
      authContext.supabaseClient,
      invitationIds,
      authContext.user.id,
    );
    const errors = result?.errors ?? [];

    if (errors.length > 0) {
      return json<ActionData>(
        {
          status: "accept_failed",
          errors,
        },
        { headers: authContext.headers, status: 400 },
      );
    }

    return json<ActionData>({ status: "accepted" }, { headers: authContext.headers });
  }

  return json<ActionData>({ status: "error", error: "Invalid action type" }, { headers, status: 400 });
};

interface VerifiedNewUserProps {
  email: string | null;
  state: NavigationState;
}

function VerifiedNewUser({ email, state }: VerifiedNewUserProps) {
  return <NewUserSignup email={email ?? ""} state={state} />;
}

interface ExistingUserProps {
  invites: ExistingUserInvite[];
  state: NavigationState;
}

function ExistingUser({ invites, state }: ExistingUserProps) {
  if (invites.length === 0) {
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
  const verifiedEmail =
    loaderData.status === "verified" ? loaderData.email ?? "" : "";

  useEffect(() => {
    if (
      state === "idle" &&
      actionData &&
      (actionData.status === "accepted" || actionData.status === "updated")
    ) {
      toast.success("Successfully signed up and accepted invitation");
      const timeout = setTimeout(() => navigate("/workspaces"), 3000);

      return () => clearTimeout(timeout);
    }
    if (state === "idle" && actionData?.status === "accept_failed") {
      toast.error("We could not accept all invitations. Please try again.");
    }
  }, [actionData, navigate, state]);

  return (
    <main className="mt-16 flex flex-col items-center justify-center text-slate-800 sm:w-full">
      <div className="flex flex-col items-center justify-center gap-5  rounded-md bg-brand-secondary px-28 py-8 shadow-lg dark:border-2 dark:border-white dark:bg-transparent dark:text-white dark:shadow-none">
        <h1 className="mb-4 font-Zilla-Slab text-3xl font-bold text-brand-primary  dark:text-white">
          Accept your invitations
        </h1>
        {loaderData.status === "verified" && (
          <VerifiedNewUser email={verifiedEmail} state={state} />
        )}
        {loaderData.status === "existing_user" && (
          <ExistingUser invites={loaderData.invites} state={state} />
        )}
        {loaderData.status === "not_signed_in" && <NotSignedIn />}
        {loaderData.status === "invalid_link" && (
          <div>{loaderData.error}</div>
        )}
        {loaderData.status === "error" && <div>{loaderData.error}</div>}
        {loaderData.status === "verified" && actionData?.status === "error" && (
          <div>{actionData.error}</div>
        )}
        {actionData?.status === "accept_failed" && (
          <div>Some invitations could not be accepted. Please review and try again.</div>
        )}
      </div>
      <Toaster richColors />
    </main>
  );
}
