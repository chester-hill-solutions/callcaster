import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { magicLink } from "better-auth/plugins";
import { describe, expect, test } from "vitest";

const BASE = "http://localhost:8123";
const EMAIL = "token-purpose-owner@example.test";
const PASSWORD = "fixture-password-3071";

async function fixture() {
  const database: Record<string, Record<string, unknown>[]> = {
    user: [],
    account: [],
    session: [],
    verification: [],
  };
  const delivered: string[] = [];
  const auth = betterAuth({
    baseURL: `${BASE}/api/auth`,
    secret: "token-purpose-fixture-secret-with-more-than-32-characters",
    database: memoryAdapter(database),
    emailAndPassword: { enabled: true },
    socialProviders: {
      google: { clientId: "dummy-client", clientSecret: "dummy-secret" },
    },
    account: { storeStateStrategy: "database" },
    plugins: [
      magicLink({
        sendMagicLink: async ({ url }) => {
          delivered.push(url);
        },
      }),
    ],
    rateLimit: { enabled: false },
    logger: { disabled: true },
  });
  const registered = await auth.api.signUpEmail({
    body: { name: "Fixture owner", email: EMAIL, password: PASSWORD },
  });
  const user = database.user.find((row) => row.id === registered.user.id);
  if (!user) throw new Error("Fixture account was not created");
  user.emailVerified = true;

  function post(path: string, body: Record<string, unknown>) {
    return auth.handler(
      new Request(`${BASE}/api/auth${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: BASE },
        body: JSON.stringify(body),
      }),
    );
  }
  async function session(response: Response) {
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    return cookie
      ? auth.api.getSession({ headers: new Headers({ cookie }) })
      : null;
  }
  return {
    auth,
    database,
    delivered,
    userId: registered.user.id,
    post,
    session,
  };
}

describe("installed Better Auth token purpose (#3071)", () => {
  test("OAuth state cannot authenticate as a Magic Link or consume the pending OAuth state", async () => {
    const f = await fixture();
    const started = await f.post("/sign-in/social", {
      provider: "google",
      callbackURL: `${BASE}/done`,
      disableRedirect: true,
      additionalData: { email: EMAIL },
    });
    expect(started.status).toBe(200);
    const body: { url: string } = await started.json();
    const state = new URL(body.url).searchParams.get("state");
    expect(state).toBeTruthy();
    expect(f.database.verification).toHaveLength(1);
    const pendingState = structuredClone(f.database.verification[0]);
    const response = await f.auth.handler(
      new Request(
        `${BASE}/api/auth/magic-link/verify?token=${encodeURIComponent(state ?? "")}&callbackURL=${BASE}/done`,
      ),
    );
    expect(await f.session(response)).toBeNull();
    expect(
      new URL(response.headers.get("Location") ?? BASE).searchParams.get(
        "error",
      ),
    ).toBe("INVALID_TOKEN");
    expect(f.database.verification).toHaveLength(1);
    expect(f.database.verification[0]).toEqual(pendingState);
  });

  test("an issued Magic Link authenticates its account once", async () => {
    const f = await fixture();
    const requested = await f.post("/sign-in/magic-link", {
      email: EMAIL,
      callbackURL: `${BASE}/done`,
    });
    expect(requested.status).toBe(200);
    expect(f.delivered).toHaveLength(1);
    const verified = await f.auth.handler(new Request(f.delivered[0]));
    expect((await f.session(verified))?.user.id).toBe(f.userId);
    const replay = await f.auth.handler(new Request(f.delivered[0]));
    expect(await f.session(replay)).toBeNull();
    expect(
      new URL(replay.headers.get("Location") ?? BASE).searchParams.get("error"),
    ).toBe("INVALID_TOKEN");
  });

  test("ordinary email/password sessions remain valid", async () => {
    const f = await fixture();
    const response = await f.post("/sign-in/email", {
      email: EMAIL,
      password: PASSWORD,
    });
    expect(response.status).toBe(200);
    expect((await f.session(response))?.user.id).toBe(f.userId);
  });
});
