import { data as routeData } from "react-router";
import { findContactsByPhone, updateContact } from "@/lib/database/contact.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { logger } from "@/lib/logger.server";
import { createTenantDb } from "@/server/tenant-db";
import { defineAction } from "@/lib/handler.server";
import { MemberRole } from "@/lib/member-role";
import { hasMinRole, workspaceRouteAuth } from "@/lib/workspace-route.server";

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

export const action = defineAction({
  auth: workspaceRouteAuth,
  sideEffects: ["db-write"],
  handler: async ({ request, params, auth }) => {
  const { id: workspace_id, contactId: selected_id } = params;
  const { user, userRole, headers } = auth;

  if (!workspace_id || !selected_id) {
    return routeData({ error: "Missing required parameters" }, { status: 400 });
  }

  if (!hasMinRole(userRole, MemberRole.Member)) {
    return routeData(
      { error: "You don't have permission to perform this action" },
      { headers, status: 403 },
    );
  }

  try {
    await requireWorkspaceAccess({
      user: { id: user.id },
      workspaceId: workspace_id,
    });

    const formData = await request.formData();
    // Normalize phone using the same helper as CSV import path (app/lib/csv-contacts.ts).
    // Read-side compensates today via buildExactPhoneCandidates fan-out;
    // normalizing on write fixes silent lookup failures for non-candidate formats.
    const phoneInput = (formData.get("phone") as string) || undefined;
    const { parsePhoneNumber } = await import("@/lib/phone");
    const normalizedPhone = phoneInput ? parsePhoneNumber(phoneInput) : undefined;

    const contactData: ContactFormData = {
      id: formData.get("id") ? Number(formData.get("id")) : undefined,
      firstname: (formData.get("firstname") as string) || undefined,
      surname: (formData.get("surname") as string) || undefined,
      phone: normalizedPhone || undefined,
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
      let duplicateWarning: string | undefined;
      if (normalizedPhone) {
        const existing = await findContactsByPhone(workspace_id, normalizedPhone, tdb);
        if (existing.length > 0) {
          const names = existing.map(
            (c) => [c.firstname, c.surname].filter(Boolean).join(" ") || `id: ${c.id}`,
          );
          duplicateWarning = `A contact with phone ${normalizedPhone} already exists: ${names.join(", ")}`;
        }
      }

      const { workspace: _workspace, id: _id, ...insertValues } = contactData;
      const [newContact] = await tdb.contact.insert(insertValues);

      if (!newContact) {
        throw new Error("Failed to create contact");
      }

      return routeData({
        success: true,
        contact: newContact,
        ...(duplicateWarning ? { warning: duplicateWarning } : {}),
      });
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
  },
});
