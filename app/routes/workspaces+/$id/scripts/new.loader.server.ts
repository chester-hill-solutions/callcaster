import type { Json } from "@/lib/database.types";
import { data as routeData, ActionFunctionArgs, LoaderFunctionArgs, Form, Link, useActionData, useLoaderData, useNavigate } from "react-router";
import { MdAdd, MdClose } from "react-icons/md";
import { data as routeData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";

export async function loader({ request, params }: LoaderFunctionArgs) {

  const { supabaseClient, headers, user } = await verifyAuth(request);
  const url = new URL(request.url);
  const search = new URLSearchParams(url.search);
  const ref = search.get("ref") || null;
  const workspaceId = params.id;
  if (workspaceId == null) {
    return routeData(
      { workspace: null, error: "Workspace does not exist" },
      { headers },
    );
  }
  let campaignType;
  if (ref) {
    const { data: campaign } = await supabaseClient
      .from("campaign")
      .select("type")
      .eq("id", Number(ref) || 0)
      .eq("workspace", workspaceId)
      .single();
    campaignType = campaign?.type;
  }
  const { data: workspaceData, error: workspaceError } = await supabaseClient
    .from("workspace")
    .select()
    .eq("id", workspaceId)
    .single();
  if (workspaceError) {
    return routeData({ workspace: null, error: workspaceError }, { headers });
  }

  return routeData(
    { workspace: workspaceData, error: null, ref: ref || null, campaignType },
    { headers },
  );
}
