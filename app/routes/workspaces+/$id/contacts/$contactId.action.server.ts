import {
  data as routeData,
  redirect,
  type ActionFunctionArgs,
} from "react-router";

import { getUserRole, requireWorkspaceAccess } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/supabase.server";

export type ContactFormData = {
  id?: number;
  firstname?: string;
  surname?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  province?: string;
  postal?: string;
  country?: string;
  external_id?: string;
  workspace: string;
};

export const action = async ({
  request,
  params,
}: ActionFunctionArgs) => {
  const { id: workspace_id, contactId: selected_id } = params;

  if (!workspace_id || !selected_id) {
    return routeData({ error: "Missing required parameters" }, { status: 400 });
  }

  try {
    const { supabaseClient, user } = await verifyAuth(request);

    if (!user) {
      return redirect("/signin");
    }

    await requireWorkspaceAccess({
      supabaseClient,
      user: { id: user.id },
      workspaceId: workspace_id,
    });

    const formData = await request.formData();
    const contactData: ContactFormData = {
      id: formData.get("id") ? Number(formData.get("id")) : undefined,
      firstname: (formData.get("firstname") as string) || undefined,
      surname: (formData.get("surname") as string) || undefined,
      phone: (formData.get("phone") as string) || undefined,
      email: (formData.get("email") as string) || undefined,
      address: (formData.get("address") as string) || undefined,
      city: (formData.get("city") as string) || undefined,
      province: (formData.get("province") as string) || undefined,
      postal: (formData.get("postal") as string) || undefined,
      country: (formData.get("country") as string) || undefined,
      external_id: (formData.get("external_id") as string) || undefined,
      workspace: workspace_id,
    };

    if (selected_id === "new") {
      const { data: newContact, error: createError } = await supabaseClient
        .from("contact")
        .insert(contactData)
        .select()
        .single();

      if (createError) {
        throw createError;
      }

      return routeData({ success: true, contact: newContact });
    }

    const { data: updatedContact, error: updateError } = await supabaseClient
      .from("contact")
      .update(contactData)
      .eq("id", Number(selected_id))
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    return routeData({ success: true, contact: updatedContact });
  } catch (error) {
    logger.error("Error in contact action:", error);
    return routeData({ error: "Failed to save contact" }, { status: 500 });
  }
};
