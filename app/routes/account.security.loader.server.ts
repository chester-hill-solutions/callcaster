import { data as routeData } from "react-router";
import { verifyAuth } from "@/lib/auth.server";
import {
  isTwoFactorEnabled,
  PRIVILEGED_WORKSPACE_ROLES,
  userHasPrivilegedWorkspaceRole,
} from "@/lib/two-factor.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { headers, user } = await verifyAuth(request);
  const url = new URL(request.url);
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
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { headers, user } = await verifyAuth(request);
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
    const privileged = await userHasPrivilegedWorkspaceRole(user.id);
    if (privileged) {
      return routeData(
        { error: "Privileged workspace roles cannot disable two-factor authentication." },
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
};
