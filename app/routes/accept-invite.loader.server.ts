import { data as routeData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import type {
  EmailOtpType,
  Session,
  SupabaseClient,
  VerifyTokenHashParams,
} from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getInvitesByUserId } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import type {
  ExistingUserInvite,
  LoaderData,
  RawInviteWithWorkspace,
  WorkspaceInviteRow,
} from "./accept-invite.types";

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
      ((await getInvitesByUserId(client, session.user.id)) as WorkspaceInviteRow[] | null) ??
      [];
    return routeData<LoaderData>(
      {
        status: "verified",
        invites,
        email,
      },
      { headers },
    );
  }

  const invites = await fetchInvitesWithWorkspace(client, session.user.id);

  return routeData<LoaderData>(
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
        return routeData<LoaderData>(
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
      return routeData<LoaderData>(
        {
          status: "verified",
          email,
          invites,
        },
        { headers },
      );
    }

    const invites = await fetchInvitesWithWorkspace(client, sessionData.user.id);

    return routeData<LoaderData>(
      {
        status: "existing_user",
        email,
        invites,
      },
      { headers },
    );
  } catch (error) {
    logger.error("Unhandled error during token verification", error);
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred while verifying.";
    return routeData<LoaderData>(
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
    return handleAuthenticatedUser(supabaseClient, session, headers);
  }

  if (token_hash && type) {
    if (!email) throw new Error("No email address found.");
    return handleTokenVerification(
      supabaseClient,
      token_hash,
      type as EmailOtpType,
      email,
      headers,
    );
  }

  return routeData<LoaderData>({ status: "not_signed_in" }, { headers });
}
