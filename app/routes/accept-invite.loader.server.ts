import { getSession } from "@/lib/auth.server";
import { data as routeData } from "react-router";
import { getInvitesByUserId } from "@/lib/database.server";
import { listUserInvitesWithWorkspace } from "@/lib/workspace-members-db.server";
import { logger } from "@/lib/logger.server";
import { auth } from "@/server/auth-instance";
import { mergeBetterAuthSetCookieHeaders } from "@/lib/better-auth-headers.server";
import { getUserById } from "@/lib/workspace-members-db.server";
import type {
  ExistingUserInvite,
  LoaderData,
  WorkspaceInviteRow,
} from "./accept-invite.types";
import type { LoaderFunctionArgs } from "react-router";

async function fetchInvitesWithWorkspace(userId: string): Promise<ExistingUserInvite[]> {
  return listUserInvitesWithWorkspace(userId);
}

function isDefaultNewUserProfile(user: {
  first_name?: string | null;
  last_name?: string | null;
}): boolean {
  return user.first_name === "New" && user.last_name === "Caller";
}

async function handleAuthenticatedUser(
  userId: string,
  email: string,
  headers: Headers,
) {
  const profile = await getUserById(userId);
  const isNewUser = profile
    ? isDefaultNewUserProfile(profile)
    : false;

  if (isNewUser) {
    const invites =
      ((await getInvitesByUserId(userId)) as WorkspaceInviteRow[] | null) ??
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

  const invites = await fetchInvitesWithWorkspace(userId);

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
  request: Request,
  token_hash: string,
  email: string,
  headers: Headers,
) {
  try {
    const result = await auth.api.verifyEmail({
      query: { token: token_hash },
      headers: request.headers,
      returnHeaders: true,
    });
    const mergedHeaders = mergeBetterAuthSetCookieHeaders(result?.headers, headers);
    const payload = result?.response ?? result;

    if (!payload?.user) {
      return routeData<LoaderData>(
        {
          status: "invalid_link",
          error:
            "The invitation link is invalid or has expired. Please request a new invitation.",
        },
        { headers: mergedHeaders },
      );
    }

    const profile = await getUserById(payload.user.id);
    const isNewUser = profile
      ? isDefaultNewUserProfile(profile)
      : false;

    if (isNewUser) {
      const invites =
        ((await getInvitesByUserId(payload.user.id)) as
          | WorkspaceInviteRow[]
          | null) ?? [];
      return routeData<LoaderData>(
        {
          status: "verified",
          email,
          invites,
        },
        { headers: mergedHeaders },
      );
    }

    const invites = await fetchInvitesWithWorkspace(payload.user.id);

    return routeData<LoaderData>(
      {
        status: "existing_user",
        email,
        invites,
      },
      { headers: mergedHeaders },
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
  const { user, headers } = await getSession(request);
  const url = new URL(request.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const email = url.searchParams.get("email");

  if (user) {
    return handleAuthenticatedUser(user.id, user.email ?? "", headers);
  }

  if (token_hash && type) {
    if (!email) throw new Error("No email address found.");
    return handleTokenVerification(request, token_hash, email, headers);
  }

  return routeData<LoaderData>({ status: "not_signed_in" }, { headers });
}
