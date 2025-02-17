import { json } from "@remix-run/node";
import { verifyAuth } from "../lib/supabase.server";

export const action = async ({ request }: { request: Request }) => {
  const { supabaseClient: supabase, user } =
    await verifyAuth(request);
  const data = await request.json();
  const {
    id,
    name,
    steps,
    workspace,
    saveAsCopy
  } = data;
  
  try {
    const scriptData = {
      name,
      steps,
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
      scriptOperation = supabase
        .from("script")
        .update(scriptData)
        .eq("id", id)
        .select();
    }

    const { data: updatedScript, error: scriptError } = await scriptOperation;

    if (scriptError) {
      if (scriptError.code === "23505") {
        return json(
          { error: "A script with this name already exists in the workspace" },
          { status: 400 }
        );
      }
      throw scriptError;
    }

    return json({ script: updatedScript[0] });

  } catch (error) {
    console.error("Error updating/creating script:", error);
    return json({ error: (error as Error).message }, { status: 500 });
  }
};