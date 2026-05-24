import { data as routeData } from "react-router";
import { formatDateToLocale } from "@/lib/utils";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/supabase.server";
import type { ActionFunctionArgs } from "react-router";
import type { Json , Database } from "@/lib/database.types";
import type { PostgrestError , SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@/lib/types";

export async function action({ request }: ActionFunctionArgs) {

  const { supabaseClient, headers } = await verifyAuth(request);

  const formData = await request.formData();
  const data = Object.fromEntries(formData.entries());

  const idValue = data["id"];
  if (!idValue) {
    return routeData({ error: "Script ID is required" }, { status: 400 });
  }

  const { data: script, error: scriptError } = await supabaseClient
    .from("script")
    .select("name, steps")
    .eq("id", Number(idValue) || 0)
    .single();

  if (scriptError) {
    logger.error("Error fetching script:", scriptError);
    return routeData({ error: "Error fetching script" }, { status: 500 });
  }

  if (!script) {
    return routeData({ error: "Script not found" }, { status: 404 });
  }

  const scriptJson = JSON.stringify(script.steps, null, 2);

  const fileName = script.name
    ? `${script.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.json`
    : `callcaster_script_${new Date().toISOString().split("T")[0]}.json`;

  return routeData(
    {
      fileContent: scriptJson,
      fileName: fileName,
      contentType: "application/json",
    },
    {
      headers: {
        ...headers,
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Type": "application/json",
      },
    },
  );
}
