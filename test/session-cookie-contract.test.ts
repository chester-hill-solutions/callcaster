import { beforeEach, describe, expect, test, vi } from "vitest";
import { createClient, type Client } from "@hey-api/client-fetch";

vi.unmock("@/lib/api-auth.server");
const fixtures = vi.hoisted(() => {
  const database: Record<string, Record<string, unknown>[]> = {
    auth_user: [],
    auth_session: [],
    auth_account: [],
    auth_verification: [],
    auth_two_factor: [],
  };
  return { baseUrl: "http://localhost", database };
});
vi.mock("better-auth/adapters/drizzle", async (importOriginal) => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  return {
    ...(await importOriginal<typeof import("better-auth/adapters/drizzle")>()),
    drizzleAdapter: () => memoryAdapter(fixtures.database),
  };
});
vi.mock("@/lib/env.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env.server")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      BASE_URL: () => fixtures.baseUrl,
      BETTER_AUTH_URL: () => `${fixtures.baseUrl}/api/auth`,
      BETTER_AUTH_SECRET: () =>
        "cookie-contract-test-secret-2100-32-characters",
    },
    isTwoFactorFeatureEnabled: () => false,
  };
});
vi.mock("@/lib/ensure-user-profile.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/ensure-user-profile.server")
  >()),
  ensureProfileForUser: vi.fn(async () => undefined),
}));

const protocols = [
  {
    baseUrl: "http://localhost",
    cookieName: "better-auth.session_token",
    scheme: "sessionCookie",
  },
  {
    baseUrl: "https://callcaster.test",
    cookieName: "__Secure-better-auth.session_token",
    scheme: "secureSessionCookie",
  },
];
const workspaceId = "550e8400-e29b-41d4-a716-446655440000";
async function issueSession() {
  const { auth } = await import("@/server/auth-instance");
  const context = await auth.$context;
  const result = await auth.api.signUpEmail({
    body: {
      name: "Cookie Owner",
      email: "cookie-owner@example.com",
      password: "cookie-test-password-2100",
    },
    headers: new Headers({ Origin: fixtures.baseUrl }),
    returnHeaders: true,
  });
  const cookie = result.headers
    .getSetCookie()
    .find((value) =>
      value.startsWith(`${context.authCookies.sessionToken.name}=`),
    );
  if (!cookie)
    throw new Error("Actual auth instance did not issue its session cookie");
  const pair = cookie.split(";")[0];
  const separator = pair.indexOf("=");
  return {
    auth,
    context,
    name: pair.slice(0, separator),
    value: pair.slice(separator + 1),
    userId: result.response.user.id,
  };
}

async function runSdk(operation: string, client: Client) {
  const sdk = await import("@/lib/api-generated/sdk.gen");
  switch (operation) {
    case "campaign":
      return sdk.createCampaignWithScript({
        client,
        body: {
          title: "Cookie test",
          type: "live_call",
          caller_id: "+14165551234",
          script_id: 42,
          workspace_id: workspaceId,
        },
      });
    case "chat":
      return sdk.sendChatSms({
        client,
        body: {
          workspace_id: workspaceId,
          to_number: "+14165551235",
          caller_id: "+14165551234",
          body: "Cookie test",
        },
      });
    case "dispatch":
      return sdk.dispatchCampaignSms({
        client,
        body: { workspace_id: workspaceId, campaign_id: "42" },
      });
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

beforeEach(() => {
  vi.resetModules();
  for (const rows of Object.values(fixtures.database)) rows.splice(0);
});

describe.each(protocols)(
  "actual session-cookie contract for $baseUrl",
  ({ baseUrl, cookieName, scheme }) => {
    beforeEach(() => {
      fixtures.baseUrl = baseUrl;
    });

    test("published schemes match the cookie issued by the real app auth instance", async () => {
      const issued = await issueSession();
      expect(issued.name).toBe(cookieName);
      expect(issued.context.authCookies.sessionToken.attributes.secure).toBe(
        baseUrl.startsWith("https:"),
      );
      const { openApiSpec } = await import("@/lib/openapi");
      const { completeOpenApiSpec } = await import("@/lib/openapi-complete");
      const { integratorOpenApiSpec } =
        await import("@/lib/openapi-integrator");
      for (const spec of [
        openApiSpec,
        completeOpenApiSpec,
        integratorOpenApiSpec,
      ]) {
        expect(spec.components.securitySchemes[scheme]).toMatchObject({
          type: "apiKey",
          in: "cookie",
          name: issued.name,
        });
        expect(
          spec.components.securitySchemes.secureSessionCookie.description,
        ).toContain("HTTPS");
        for (const path of Object.values(spec.paths)) {
          for (const operation of Object.values(path)) {
            if (
              !operation ||
              typeof operation !== "object" ||
              !("security" in operation)
            )
              continue;
            const security = operation.security;
            if (
              Array.isArray(security) &&
              security.some((item) => "sessionCookie" in item)
            ) {
              expect(security).toContainEqual({ [scheme]: [] });
            }
          }
        }
      }
    });

    test.each(["campaign", "chat", "dispatch"])(
      "generated %s SDK sends the issued cookie through real session verification",
      async (operation) => {
        const issued = await issueSession();
        const { requireJsonAuth } = await import("@/lib/api-auth.server");
        let authenticatedUser: string | undefined;
        let sentCookie: string | null = null;
        const client = createClient({
          baseUrl,
          auth: (mechanism) =>
            mechanism.in === "cookie" && mechanism.name === issued.name
              ? issued.value
              : undefined,
          fetch: async (request) => {
            sentCookie = request.headers.get("Cookie");
            const auth = await requireJsonAuth(request);
            if (auth instanceof Response) return auth;
            authenticatedUser = auth.user.id;
            return Response.json({ ok: true });
          },
        });
        const result = await runSdk(operation, client);
        expect(result.response.status).toBe(200);
        expect(authenticatedUser).toBe(issued.userId);
        expect(sentCookie).toBe(`${cookieName}=${issued.value}`);
      },
    );

    test("the issued browser cookie authenticates without an SDK auth callback", async () => {
      const issued = await issueSession();
      const { requireJsonAuth } = await import("@/lib/api-auth.server");
      const result = await requireJsonAuth(
        new Request(`${baseUrl}/api/token`, {
          headers: { Cookie: `${issued.name}=${issued.value}` },
        }),
      );
      expect(result).toMatchObject({
        authType: "session",
        user: { id: issued.userId },
      });
    });

    test.each(["sb-access-token", "opposite-prefix"])(
      "a cookie renamed to %s is refused by the real verifier",
      async (wrongName) => {
        const issued = await issueSession();
        const name =
          wrongName === "opposite-prefix"
            ? scheme === "sessionCookie"
              ? "__Secure-better-auth.session_token"
              : "better-auth.session_token"
            : wrongName;
        const { requireJsonAuth } = await import("@/lib/api-auth.server");
        const result = await requireJsonAuth(
          new Request(`${baseUrl}/api/token`, {
            headers: { Cookie: `${name}=${issued.value}` },
          }),
        );
        expect(result).toBeInstanceOf(Response);
        if (!(result instanceof Response))
          throw new Error("Renamed cookie was accepted");
        expect(result.status).toBe(401);
      },
    );

    test("a changed signed cookie value is refused", async () => {
      const issued = await issueSession();
      const { requireJsonAuth } = await import("@/lib/api-auth.server");
      const result = await requireJsonAuth(
        new Request(`${baseUrl}/api/token`, {
          headers: { Cookie: `${issued.name}=tampered-${issued.value}` },
        }),
      );
      expect(result).toBeInstanceOf(Response);
      if (!(result instanceof Response))
        throw new Error("Tampered cookie was accepted");
      expect(result.status).toBe(401);
    });

    test("SDK API-key selection retains the header mechanism without a cookie", async () => {
      let sentCookie: string | null = null;
      let sentKey: string | null = null;
      const client = createClient({
        baseUrl,
        auth: (mechanism) =>
          mechanism.name === "X-API-Key" ? "cc_cookie-contract-key" : undefined,
        fetch: async (request) => {
          sentCookie = request.headers.get("Cookie");
          sentKey = request.headers.get("X-API-Key");
          return Response.json({ ok: true });
        },
      });
      const result = await runSdk("chat", client);
      expect(result.response.status).toBe(200);
      expect(sentKey).toBe("cc_cookie-contract-key");
      expect(sentCookie).toBeNull();
    });
  },
);
