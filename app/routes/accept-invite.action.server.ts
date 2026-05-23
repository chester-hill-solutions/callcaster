import { data as routeData } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { acceptWorkspaceInvitations } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { createSupabaseServerClient, verifyAuth } from "@/lib/supabase.server";
import type { ActionData } from "./accept-invite.types";

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
        return routeData<ActionData>(
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

      return routeData<ActionData>(
        { status: "updated", invites: invites ?? [] },
        { headers },
      );
    } catch (error) {
      logger.error("Error in updateUser:", error);
      const message =
        error instanceof Error ? error.message : "An unexpected error occurred";
      return routeData<ActionData>(
        { status: "error", error: message },
        { headers, status: 500 },
      );
    }
  }

  if (actionType === "acceptInvitations") {
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
      return routeData<ActionData>(
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
      return routeData<ActionData>(
        {
          status: "accept_failed",
          errors,
        },
        { headers: authContext.headers, status: 400 },
      );
    }

    return routeData<ActionData>({ status: "accepted" }, { headers: authContext.headers });
  }

  return routeData<ActionData>({ status: "error", error: "Invalid action type" }, { headers, status: 400 });
};
