import { beforeEach, vi } from "vitest";
import {
  requireDualAuth,
  requireJsonAuth,
  requireSudo,
  resolveDualAuthSession,
  resolveJsonAuthSession,
} from "@/lib/api-auth.server";

export type RouteAuthSessionInput = {
  supabaseClient?: unknown;
  user?: { id: string; email?: string } | null;
  headers?: Headers;
  authType?: "session" | "bearer";
  userData?: { id: string; access_level?: string; [key: string]: unknown };
};

function unauthorizedResponse(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

function forbiddenResponse(): Response {
  return Response.json({ error: "Forbidden" }, { status: 403 });
}

function buildJsonAuth(session: RouteAuthSessionInput) {
  if (!session.user) {
    return unauthorizedResponse();
  }
  const authType = session.authType ?? "session";
  return {
    authType,
    supabaseClient: session.supabaseClient ?? {},
    user: session.user,
    ...(authType === "bearer" ? { accessToken: "test-token" } : {}),
  };
}

function buildDualAuth(session: RouteAuthSessionInput) {
  if (session.user === null) {
    return unauthorizedResponse();
  }
  if (session.user) {
    return buildJsonAuth(session);
  }
  return {
    authType: "api_key" as const,
    workspaceId: "w-test",
    supabase: session.supabaseClient ?? {},
  };
}

function buildSudoAuth(session: RouteAuthSessionInput) {
  if (!session.user) {
    return forbiddenResponse();
  }
  return {
    supabaseClient: session.supabaseClient ?? {},
    user: session.user,
    userData: session.userData ?? {
      id: session.user.id,
      access_level: "sudo",
    },
  };
}

export function resetRouteAuthMocks(): void {
  vi.mocked(requireDualAuth).mockReset();
  vi.mocked(requireJsonAuth).mockReset();
  vi.mocked(requireSudo).mockReset();
  vi.mocked(resolveDualAuthSession).mockReset();
  vi.mocked(resolveJsonAuthSession).mockReset();
  vi.mocked(requireDualAuth).mockResolvedValue(unauthorizedResponse());
  vi.mocked(requireJsonAuth).mockResolvedValue(unauthorizedResponse());
  vi.mocked(requireSudo).mockResolvedValue(forbiddenResponse());
  vi.mocked(resolveDualAuthSession).mockRejectedValue(unauthorizedResponse());
  vi.mocked(resolveJsonAuthSession).mockRejectedValue(unauthorizedResponse());
}

export function setDualAuthSession(session: RouteAuthSessionInput): unknown {
  const auth = buildDualAuth(session);
  vi.mocked(requireDualAuth).mockResolvedValue(auth);
  vi.mocked(requireJsonAuth).mockResolvedValue(
    session.user ? buildJsonAuth(session) : unauthorizedResponse(),
  );
  const sessionResult = {
    supabaseClient: session.supabaseClient ?? {},
    headers: session.headers ?? new Headers(),
    user: session.user ?? undefined,
  };
  vi.mocked(resolveDualAuthSession).mockResolvedValue(sessionResult);
  vi.mocked(resolveJsonAuthSession).mockResolvedValue(sessionResult);
  return auth;
}

export function queueDualAuthSession(session: RouteAuthSessionInput): unknown {
  const auth = buildDualAuth(session);
  vi.mocked(requireDualAuth).mockResolvedValueOnce(auth);
  vi.mocked(requireJsonAuth).mockResolvedValueOnce(
    session.user ? buildJsonAuth(session) : unauthorizedResponse(),
  );
  return auth;
}

export function setJsonAuthSession(session: RouteAuthSessionInput): unknown {
  const auth = buildJsonAuth(session);
  vi.mocked(requireJsonAuth).mockResolvedValue(auth);
  vi.mocked(resolveJsonAuthSession).mockResolvedValue({
    supabaseClient: session.supabaseClient ?? {},
    headers: session.headers ?? new Headers(),
    user: session.user ?? undefined,
  });
  return auth;
}

export function queueJsonAuthSession(session: RouteAuthSessionInput): unknown {
  const auth = buildJsonAuth(session);
  vi.mocked(requireJsonAuth).mockResolvedValueOnce(auth);
  return auth;
}

export function setDualAuthUnauthorized(): void {
  vi.mocked(requireDualAuth).mockResolvedValue(unauthorizedResponse());
}

export function queueDualAuthUnauthorized(): void {
  vi.mocked(requireDualAuth).mockResolvedValueOnce(unauthorizedResponse());
}

export function setJsonAuthUnauthorized(): void {
  vi.mocked(requireJsonAuth).mockResolvedValue(unauthorizedResponse());
}

export function queueJsonAuthUnauthorized(): void {
  vi.mocked(requireJsonAuth).mockResolvedValueOnce(unauthorizedResponse());
}

export function setSudoAuth(session: RouteAuthSessionInput): unknown {
  const auth = buildSudoAuth(session);
  vi.mocked(requireSudo).mockResolvedValue(auth);
  vi.mocked(requireJsonAuth).mockResolvedValue(buildJsonAuth(session));
  return auth;
}

export function queueSudoAuth(session: RouteAuthSessionInput): unknown {
  const auth = buildSudoAuth(session);
  vi.mocked(requireSudo).mockResolvedValueOnce(auth);
  vi.mocked(requireJsonAuth).mockResolvedValueOnce(buildJsonAuth(session));
  return auth;
}

beforeEach(() => {
  resetRouteAuthMocks();
});
