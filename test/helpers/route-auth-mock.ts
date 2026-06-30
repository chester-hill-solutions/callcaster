import { beforeEach } from "vitest";
import { getRouteAuthMocks } from "../setup-route-auth-mock";

export type RouteAuthSessionInput = {
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
  };
}

function buildSudoAuth(session: RouteAuthSessionInput) {
  if (!session.user) {
    return forbiddenResponse();
  }
  return {
    user: session.user,
    userData: session.userData ?? {
      id: session.user.id,
      access_level: "sudo",
    },
  };
}

export function resetRouteAuthMocks(): void {
  const routeAuthMocks = getRouteAuthMocks();
  routeAuthMocks.requireDualAuth.mockReset();
  routeAuthMocks.requireJsonAuth.mockReset();
  routeAuthMocks.requireSudo.mockReset();
  routeAuthMocks.resolveDualAuthSession.mockReset();
  routeAuthMocks.resolveJsonAuthSession.mockReset();
  routeAuthMocks.requireDualAuth.mockResolvedValue(unauthorizedResponse());
  routeAuthMocks.requireJsonAuth.mockResolvedValue(unauthorizedResponse());
  routeAuthMocks.requireSudo.mockResolvedValue(forbiddenResponse());
  routeAuthMocks.resolveDualAuthSession.mockRejectedValue(unauthorizedResponse());
  routeAuthMocks.resolveJsonAuthSession.mockRejectedValue(unauthorizedResponse());
}

export function setDualAuthSession(session: RouteAuthSessionInput): unknown {
  const routeAuthMocks = getRouteAuthMocks();
  const auth = buildDualAuth(session);
  routeAuthMocks.requireDualAuth.mockResolvedValue(auth);
  routeAuthMocks.requireJsonAuth.mockResolvedValue(
    session.user ? buildJsonAuth(session) : unauthorizedResponse(),
  );
  const sessionResult = {
    headers: session.headers ?? new Headers(),
    user: session.user ?? undefined,
  };
  routeAuthMocks.resolveDualAuthSession.mockResolvedValue(sessionResult);
  routeAuthMocks.resolveJsonAuthSession.mockResolvedValue(sessionResult);
  return auth;
}

export function queueDualAuthSession(session: RouteAuthSessionInput): unknown {
  const routeAuthMocks = getRouteAuthMocks();
  const auth = buildDualAuth(session);
  routeAuthMocks.requireDualAuth.mockResolvedValueOnce(auth);
  routeAuthMocks.requireJsonAuth.mockResolvedValueOnce(
    session.user ? buildJsonAuth(session) : unauthorizedResponse(),
  );
  return auth;
}

export function setJsonAuthSession(session: RouteAuthSessionInput): unknown {
  const routeAuthMocks = getRouteAuthMocks();
  const auth = buildJsonAuth(session);
  routeAuthMocks.requireJsonAuth.mockResolvedValue(auth);
  routeAuthMocks.resolveJsonAuthSession.mockResolvedValue({
    headers: session.headers ?? new Headers(),
    user: session.user ?? undefined,
  });
  return auth;
}

export function queueJsonAuthSession(session: RouteAuthSessionInput): unknown {
  const routeAuthMocks = getRouteAuthMocks();
  const auth = buildJsonAuth(session);
  routeAuthMocks.requireJsonAuth.mockResolvedValueOnce(auth);
  return auth;
}

export function setDualAuthUnauthorized(): void {
  getRouteAuthMocks().requireDualAuth.mockResolvedValue(unauthorizedResponse());
}

export function queueDualAuthUnauthorized(): void {
  getRouteAuthMocks().requireDualAuth.mockResolvedValueOnce(unauthorizedResponse());
}

export function setJsonAuthUnauthorized(): void {
  getRouteAuthMocks().requireJsonAuth.mockResolvedValue(unauthorizedResponse());
}

export function queueJsonAuthUnauthorized(): void {
  getRouteAuthMocks().requireJsonAuth.mockResolvedValueOnce(unauthorizedResponse());
}

export function setSudoAuth(session: RouteAuthSessionInput): unknown {
  const routeAuthMocks = getRouteAuthMocks();
  const auth = buildSudoAuth(session);
  routeAuthMocks.requireSudo.mockResolvedValue(auth);
  routeAuthMocks.requireJsonAuth.mockResolvedValue(buildJsonAuth(session));
  return auth;
}

export function queueSudoAuth(session: RouteAuthSessionInput): unknown {
  const routeAuthMocks = getRouteAuthMocks();
  const auth = buildSudoAuth(session);
  routeAuthMocks.requireSudo.mockResolvedValueOnce(auth);
  routeAuthMocks.requireJsonAuth.mockResolvedValueOnce(buildJsonAuth(session));
  return auth;
}

beforeEach(() => {
  resetRouteAuthMocks();
});
