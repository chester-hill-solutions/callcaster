// @ts-nocheck
import { data as routeData } from "react-router";



import type { TablesInsert } from "@/lib/database.types";

export const action = async ({ request }: { request: Request }) => {  const { logger } = await import("@/lib/logger.server");
  const { verifyAuth } = await import("@/lib/supabase.server");
  const { safeParseJson } = await import("@/lib/database.server");

  const { supabaseClient: supabase, user } =
    await verifyAuth(request);
  const data = await safeParseJson<Record<string, unknown>>(request);
  const {
    id,
    name,
    steps,
    workspace,
    saveAsCopy
  } = data;
  
  try {
    if (
      typeof name !== "string" ||
      typeof workspace !== "string" ||
      (typeof id !== "number" && typeof id !== "string" && id != null)
    ) {
      return routeData({ error: "Invalid script payload" }, { status: 400 });
    }

    const scriptData: TablesInsert<"script"> = {
      name,
      steps: (steps ?? null) as TablesInsert<"script">["steps"],
      updated_at: new Date().toISOString(),
      updated_by: user.id,
      workspace,
    };

    let scriptOperation;
    if (saveAsCopy || !id) {
      scriptOperation = supabase
        .from("script")
        .insert({...scriptData, name: saveAsCopy ? `${name} (Copy)` : name})
        .select();
    } else {
      const scriptId = typeof id === "number" ? id : Number(id);
      scriptOperation = supabase
        .from("script")
        .update(scriptData)
        .eq("id", scriptId)
        .select();
    }

    const { data: updatedScript, error: scriptError } = await scriptOperation;

    if (scriptError) {
      if (scriptError.code === "23505") {
        return routeData(
          { error: "A script with this name already exists in the workspace" },
          { status: 400 }
        );
      }
      throw scriptError;
    }

    return routeData({ script: updatedScript[0] });

  } catch (error) {
    logger.error("Error updating/creating script:", error);
    return routeData({ error: (error as Error).message }, { status: 500 });
  }
};