import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { data as routeData, ActionFunctionArgs, redirect, Form, useActionData, useOutletContext, useParams, useSubmit, useNavigation } from "react-router";
import { MdArrowForward, MdCheck } from "react-icons/md";
import { data as routeData, redirect } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";

export async function action({ request, params }: ActionFunctionArgs) {

  const { supabaseClient, headers, user } = await verifyAuth(request);

  const workspaceId = params.id;

  if (workspaceId == null) {
    return routeData(
      {
        success: false,
        error: "Workspace not found",
      },
      { headers },
    );
  }

  const formData = await request.formData();
  const formAction = formData.get("formAction") as string;
  const audienceName = formData.get("audience-name") as string;
  

  if (!audienceName) {
    return routeData(
      {
        success: false,
        error: "Audience name is required",
      },
      { headers },
    );
  }

  switch (formAction) {
    case "createAudience": {
      // Just create the audience without contacts
      const { data: audienceData, error: audienceError } = await supabaseClient
        .from("audience")
        .insert({
          name: audienceName,
          workspace: workspaceId,
          status: "empty",
        })
        .select()
        .single();

      if (audienceError) {
        return routeData(
          {
            success: false,
            error: audienceError.message,
          },
          { headers },
        );
      }

      return redirect(`/workspaces/${workspaceId}/audiences/${audienceData.id}`, { headers });
    }
    default:
      break;
  }

  return routeData({ success: false, error: "Form Action not recognized" }, { headers });
}
