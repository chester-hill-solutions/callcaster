import { data as routeData } from "react-router";
import { z } from "zod";

import { verifyAuth } from "@/lib/auth.server";
import { mergeBetterAuthSetCookieHeaders } from "@/lib/better-auth-headers.server";
import { defineAction, defineLoader } from "@/lib/handler.server";
import { updateMeProfile } from "@/lib/platform-auth.server";
import { getUserById } from "@/lib/workspace-members-db.server";

const accountProfileSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(100),
  last_name: z.string().trim().min(1, "Last name is required").max(100),
});

export const loader = defineLoader({
  auth: ({ request }) => verifyAuth(request, "/account"),
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    const profile = await getUserById(auth.user.id);

    return routeData(
      {
        firstName: profile?.first_name ?? "",
        lastName: profile?.last_name ?? "",
        email: auth.user.email ?? profile?.username ?? "",
      },
      { headers: auth.headers },
    );
  },
});

export const action = defineAction({
  auth: ({ request }) => verifyAuth(request, "/account"),
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {
    const formData = await request.formData();
    const parsed = accountProfileSchema.safeParse({
      first_name: formData.get("first_name"),
      last_name: formData.get("last_name"),
    });

    if (!parsed.success) {
      return routeData(
        {
          error: parsed.error.issues[0]?.message ?? "Enter a valid name",
        },
        { status: 400, headers: auth.headers },
      );
    }

    const result = await updateMeProfile(request, auth.user.id, parsed.data);
    if (!result.ok) {
      return routeData(
        { error: result.error },
        { status: result.status, headers: auth.headers },
      );
    }

    return routeData(
      { success: true },
      {
        headers: mergeBetterAuthSetCookieHeaders(result.headers, auth.headers),
      },
    );
  },
});
