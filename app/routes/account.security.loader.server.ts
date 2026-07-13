import { data as routeData } from "react-router";
import { verifyAuth } from "@/lib/auth.server";
import {
  isTwoFactorEnabled,
  PRIVILEGED_WORKSPACE_ROLES,
  userHasPrivilegedWorkspaceRole,
  userIsTwoFactorProtected,
} from "@/lib/two-factor.server";
import { defineAction, defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: ({ request }) => verifyAuth(request),
  sideEffects: ["db-read"],
  handler: async ({ url, auth }) => {
    const { headers, user } = auth;
    const enrollRequired = url.searchParams.get("enroll") === "1";
    const next = url.searchParams.get("next");
    const [privileged, enabled] = await Promise.all([
      userHasPrivilegedWorkspaceRole(user.id),
      isTwoFactorEnabled(user.id),
    ]);

    return routeData(
      {
        privileged,
        twoFactorEnabled: enabled,
        enrollRequired,
        next,
        privilegedRoles: PRIVILEGED_WORKSPACE_ROLES,
      },
      { headers },
    );
  },
});

export const action = defineAction({
  auth: ({ request }) => verifyAuth(request),
  sideEffects: ["db-write"],
  handler: async ({ request, auth: authContext }) => {
    const { headers, user } = authContext;
    const formData = await request.formData();
    const intent = String(formData.get("intent") ?? "");
    const { auth } = await import("@/server/auth-instance");
    const authApi = auth.api as typeof auth.api & {
      enableTwoFactor: (args: Record<string, unknown>) => Promise<unknown>;
      verifyTOTP: (args: Record<string, unknown>) => Promise<unknown>;
      disableTwoFactor: (args: Record<string, unknown>) => Promise<unknown>;
    };

    if (intent === "enable") {
      const password = String(formData.get("password") ?? "");
      if (!password) {
        return routeData({ error: "Password is required" }, { headers });
      }

      try {
        const result = await authApi.enableTwoFactor({
          body: { password },
          headers: request.headers,
          returnHeaders: true,
        });
        const payload = (result as { response?: { totpURI?: string; backupCodes?: string[] } })
          ?.response ?? result;
        const mergedHeaders = new Headers(headers);
        const setCookie = (result as { headers?: HeadersInit })?.headers;
        if (setCookie instanceof Headers) {
          setCookie.forEach((value, key) => mergedHeaders.append(key, value));
        }

        return routeData(
          {
            step: "verify",
            totpURI: (payload as { totpURI?: string })?.totpURI ?? null,
            backupCodes: (payload as { backupCodes?: string[] })?.backupCodes ?? [],
          },
          { headers: mergedHeaders },
        );
      } catch (error) {
        return routeData(
          { error: error instanceof Error ? error.message : "Failed to enable 2FA" },
          { headers },
        );
      }
    }

    if (intent === "verify") {
      const code = String(formData.get("code") ?? "").trim();
      if (!code) {
        return routeData({ error: "Enter the code from your authenticator app" }, { headers });
      }

      try {
        await authApi.verifyTOTP({
          body: { code },
          headers: request.headers,
          returnHeaders: true,
        });
        return routeData({ success: "Two-factor authentication is enabled.", enabled: true }, { headers });
      } catch (error) {
        return routeData(
          { error: error instanceof Error ? error.message : "Invalid code" },
          { headers },
        );
      }
    }

    if (intent === "disable") {
      const password = String(formData.get("password") ?? "");
      // Mirror the enrollment mandate: anyone forced to keep 2FA (sudo admins or
      // privileged workspace roles) cannot disable it. Checking only workspace
      // role here would let a sudo-only account turn off the 2FA the admin panel
      // then re-mandates, bouncing them out until they re-enroll.
      const protectedUser = await userIsTwoFactorProtected(user.id);
      if (protectedUser) {
        return routeData(
          { error: "Privileged accounts cannot disable two-factor authentication." },
          { headers },
        );
      }

      try {
        await authApi.disableTwoFactor({
          body: { password },
          headers: request.headers,
        });
        return routeData({ success: "Two-factor authentication disabled.", enabled: false }, { headers });
      } catch (error) {
        return routeData(
          { error: error instanceof Error ? error.message : "Failed to disable 2FA" },
          { headers },
        );
      }
    }

    return routeData({ error: "Unknown action" }, { headers });
  },
});
