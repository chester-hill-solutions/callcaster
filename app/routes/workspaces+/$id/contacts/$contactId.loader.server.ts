import {
  data as routeData,
  redirect,
  type LoaderFunctionArgs,
} from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger.server";
import { getUserRole } from "@/lib/database.server";
import { verifyAuth } from "@/lib/supabase.server";
import type { Audience, Contact, User, WorkspaceData } from "@/lib/types";
import type { MemberRole } from "@/components/workspace/TeamMember";

export type ContactIdLoaderData = {
  workspace: WorkspaceData;
  workspace_id: string;
  selected_id: string;
  contact: Contact | null;
  userRole: MemberRole;
  audiences: Audience[];
};

export const loader = async ({
  request,
  params,
}: LoaderFunctionArgs) => {
  const { id: workspace_id, contactId: selected_id } = params;

  if (!workspace_id) {
    return redirect("/workspaces");
  }

  if (!selected_id) {
    return redirect(`/workspaces/${workspace_id}`);
  }

  try {
    const { supabaseClient, user } = await verifyAuth(request);

    if (!user) {
      return redirect("/signin");
    }

    const userRole = await getUserRole({
      supabaseClient: supabaseClient as SupabaseClient,
      user: user as unknown as User,
      workspaceId: workspace_id,
    });

    if (!userRole?.role) {
      return redirect(`/workspaces/${workspace_id}`);
    }

    const { data: workspaceData, error: workspaceError } = await supabaseClient
      .from("workspace")
      .select()
      .eq("id", workspace_id)
      .single();

    if (workspaceError) {
      throw workspaceError;
    }

    let contact: Contact | null = null;

    if (selected_id !== "new") {
      const { data, error: contactError } = await supabaseClient
        .from("contact")
        .select(`*, outreach_attempt(*, campaign(*)), contact_audience(*)`)
        .eq("id", Number(selected_id) || 0)
        .filter("outreach_attempt.workspace", "eq", workspace_id)
        .single();

      if (contactError) {
        throw contactError;
      }

      contact = data;
    }

    const { data: audiences, error: audiencesError } = await supabaseClient
      .from("audience")
      .select(`*`)
      .eq("workspace", workspace_id);

    if (audiencesError) {
      throw audiencesError;
    }

    return routeData({
      workspace: workspaceData,
      workspace_id,
      selected_id,
      contact,
      userRole,
      audiences: audiences || [],
    } satisfies ContactIdLoaderData);
  } catch (error) {
    logger.error("Error in contact loader:", error);
    return redirect(`/workspaces/${workspace_id}`);
  }
};
