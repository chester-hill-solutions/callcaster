import { data as routeData } from "react-router";
import { requireWorkspaceAccess, updateContact } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/supabase.server";
import { createTenantDb } from "@/server/tenant-db";
import type { ActionFunctionArgs } from "react-router";

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
    const { user } = await verifyAuth(request);

    await requireWorkspaceAccess({
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

    const tdb = createTenantDb(workspace_id);

    if (selected_id === "new") {
      const { workspace: _workspace, id: _id, ...insertValues } = contactData;
      const [newContact] = await tdb.contact.insert(insertValues);

      if (!newContact) {
        throw new Error("Failed to create contact");
      }

      return routeData({ success: true, contact: newContact });
    }

    const contactId = Number(selected_id);
    const { workspace: _workspace, ...updateValues } = contactData;
    const updatedContact = await updateContact(workspace_id, {
      ...updateValues,
      id: contactId,
    });

    return routeData({ success: true, contact: updatedContact });
  } catch (error) {
    logger.error("Error in contact action:", error);
    return routeData({ error: "Failed to save contact" }, { status: 500 });
  }
};
