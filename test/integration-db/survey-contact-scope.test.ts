import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { RouterContextProvider } from "react-router";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { normalizeRouteResult, routeArgs } from "../helpers/route-result";

vi.mock("@/lib/send-verification-email.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/send-verification-email.server")
  >()),
  sendVerificationEmail: vi.fn(),
  sendAccountExistsEmail: vi.fn(),
}));
vi.mock("@/lib/send-reset-password-email.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/send-reset-password-email.server")
  >()),
  sendResetPasswordEmail: vi.fn(),
}));
vi.mock("@/lib/logger.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logger.server")>()),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const workspace = randomUUID();
const foreignWorkspace = randomUUID();
const publicId = randomUUID();
const email = `owned-survey-2864-${randomUUID()}@example.test`;
const rawKey = `cc_${randomUUID().replaceAll("-", "")}`;
const origin = "http://127.0.0.1:3046";
const authKinds: ("session" | "api-key")[] = ["session", "api-key"];

if (!databaseUrl)
  process.stderr.write(
    "Survey contact SQL proof skipped: INTEGRATION_DB_URL is required.\n",
  );

describe.skipIf(!databaseUrl)(
  "survey contact ownership at the shared sink (#2864)",
  () => {
    let client: ReturnType<typeof postgres>;
    let userId: string;
    let cookie: string;
    let surveyId: number;
    let ownContact: number;
    let foreignContact: number;
    let action: typeof import("@/routes/api+/survey-responses.action.server").action;
    let surveys: typeof import("@/lib/survey-db.server");
    const closePools: (() => Promise<unknown>)[] = [];

    beforeAll(async () => {
      if (!databaseUrl) throw new Error("Isolated test database required");
      for (const [name, value] of Object.entries({
        DATABASE_URL: databaseUrl,
        DATABASE_DIRECT_URL: databaseUrl,
        BASE_URL: origin,
        BETTER_AUTH_URL: `${origin}/api/auth`,
        BETTER_AUTH_SECRET: "owned-survey-contact-2864-test-secret",
        TZ: "UTC",
      }))
        vi.stubEnv(name, value);
      vi.stubGlobal(
        "fetch",
        vi.fn(() => {
          throw new Error(
            "External requests are forbidden in the survey fixture",
          );
        }),
      );
      client = postgres(databaseUrl, { max: 2 });
      closePools.push(() => client.end());
      const { pool, directPool } = await import("@/server/db");
      closePools.push(
        () => pool.end(),
        () => directPool.end(),
      );
      const { auth } = await import("@/server/auth-instance");
      const context = await auth.$context;
      const password = "OwnedSurvey2864Password!";
      await auth.api.signUpEmail({
        body: { name: "Owned survey caller", email, password },
        headers: new Headers({ Origin: origin }),
      });
      // Email delivery has its own tier. This fixture needs a real verified session,
      // with delivery captured above so no inbox or provider request is made.
      await client`update auth_user set email_verified = true where email = ${email}`;
      const signedIn = await auth.api.signInEmail({
        body: { email, password },
        headers: new Headers({ Origin: origin }),
        returnHeaders: true,
      });
      userId = signedIn.response.user.id;
      const sessionCookie = signedIn.headers
        .getSetCookie()
        .find((value) =>
          value.startsWith(context.authCookies.sessionToken.name + "="),
        );
      if (!sessionCookie) throw new Error("Real caller session cookie missing");
      cookie = sessionCookie.split(";")[0];
      await client`insert into workspace (id, name) values (${workspace}, 'Owned survey scope'), (${foreignWorkspace}, 'Foreign survey scope')`;
      await client`insert into workspace_member (id, workspace_id, user_id, role_id) values (${randomUUID()}, ${workspace}, ${userId}, 'caller')`;
      await client`insert into workspace_api_key (workspace_id, name, key_prefix, key_hash, created_by, scopes)
      values (${workspace}, 'Owned survey key', ${rawKey.slice(0, 24)}, ${createHash("sha256").update(rawKey).digest("hex")}, ${userId}, '{}'::text[])`;
      const contacts =
        await client`insert into contact (workspace, firstname, surname, phone)
      values (${workspace}, 'Own', 'Respondent', '+15550002864'), (${foreignWorkspace}, 'Foreign', 'Respondent', '+15550002865') returning id`;
      [ownContact, foreignContact] = contacts.map((row) => Number(row.id));
      const [survey] =
        await client`insert into survey (survey_id, title, workspace, is_active)
      values (${publicId}, 'Owned survey', ${workspace}, true) returning id`;
      surveyId = Number(survey.id);
      expect(
        await client`select id from contact where id = 2147483647`,
      ).toHaveLength(0);
      ({ action } =
        await import("@/routes/api+/survey-responses.action.server"));
      surveys = await import("@/lib/survey-db.server");
    });

    beforeEach(async () => {
      await client`delete from survey_response where survey_id = ${surveyId}`;
    });

    afterAll(async () => {
      const failures: unknown[] = [];
      try {
        try {
          if (client) {
            await client`delete from workspace_api_key where workspace_id = ${workspace}`;
            await client`delete from workspace where id in (${workspace}, ${foreignWorkspace})`;
            if (userId) {
              await client`delete from auth_verification where identifier = ${email}`;
              await client`delete from public."user" where id = ${userId}`;
              await client`delete from auth_user where id = ${userId}`;
            }
          }
        } catch (error) {
          failures.push(error);
        }
        const closed = await Promise.allSettled(
          closePools.map((close) => close()),
        );
        for (const result of closed)
          if (result.status === "rejected") failures.push(result.reason);
      } finally {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
      }
      if (failures.length)
        throw new AggregateError(
          failures,
          "Owned survey fixture cleanup failed",
        );
    });

    async function submit(
      kind: "session" | "api-key",
      contactId?: number,
      resultId = randomUUID(),
    ) {
      const body = new FormData();
      body.set("surveyId", publicId);
      body.set(
        "responseData",
        JSON.stringify({ result_id: resultId, contact_id: contactId }),
      );
      const request = new Request(`${origin}/api/survey-responses`, {
        method: "POST",
        body,
        headers:
          kind === "session" ? { Cookie: cookie } : { "X-API-Key": rawKey },
      });
      return normalizeRouteResult(
        await action({
          ...routeArgs(request),
          context: new RouterContextProvider(),
        }),
      );
    }

    async function stored() {
      return client`select result_id, contact_id::text, last_page_completed from survey_response where survey_id = ${surveyId} order by result_id`;
    }

    test.each(authKinds)(
      "%s refuses another workspace's existing contact before writing",
      async (kind) => {
        expect(await submit(kind, foreignContact)).toMatchObject({
          status: 400,
          body: { error: "Invalid contact" },
        });
        expect(await stored()).toHaveLength(0);
        expect(
          await client`select workspace::text from contact where id = ${foreignContact}`,
        ).toEqual([{ workspace: foreignWorkspace }]);
      },
    );

    test.each(authKinds)(
      "%s treats a missing contact like a foreign contact",
      async (kind) => {
        expect(await submit(kind, 2147483647)).toMatchObject({
          status: 400,
          body: { error: "Invalid contact" },
        });
        expect(await stored()).toHaveLength(0);
      },
    );

    test.each(authKinds)("%s can still store its own contact", async (kind) => {
      const resultId = randomUUID();
      expect(await submit(kind, ownContact, resultId)).toMatchObject({
        status: 200,
        body: { success: true, result_id: resultId },
      });
      expect(await stored()).toEqual([
        {
          result_id: resultId,
          contact_id: String(ownContact),
          last_page_completed: null,
        },
      ]);
    });

    test("a valid caller can still submit without a contact", async () => {
      expect(await submit("session")).toMatchObject({
        status: 200,
        body: { success: true },
      });
      expect(await stored()).toMatchObject([{ contact_id: null }]);
    });

    test("direct callers of the shared service inherit the ownership check", async () => {
      expect(
        await surveys.submitSurveyResponse({
          surveyPublicId: publicId,
          responseData: { result_id: randomUUID(), contact_id: foreignContact },
        }),
      ).toEqual({ ok: false, error: "Invalid contact", status: 400 });
      expect(await stored()).toHaveLength(0);
    });

    test.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
      "invalid contact ID %s is refused before writing",
      async (contactId) => {
        expect(
          await surveys.submitSurveyResponse({
            surveyPublicId: publicId,
            responseData: { result_id: randomUUID(), contact_id: contactId },
          }),
        ).toEqual({ ok: false, error: "Invalid contact", status: 400 });
        expect(await stored()).toHaveLength(0);
      },
    );

    test("a rejected contact cannot change an existing response", async () => {
      const resultId = randomUUID();
      await client`insert into survey_response (survey_id, result_id, contact_id, last_page_completed)
      values (${surveyId}, ${resultId}, ${ownContact}, 'original-page')`;
      const before = await stored();
      expect(
        await surveys.submitSurveyResponse({
          surveyPublicId: publicId,
          responseData: {
            result_id: resultId,
            contact_id: foreignContact,
            last_page_completed: "changed-page",
          },
        }),
      ).toEqual({ ok: false, error: "Invalid contact", status: 400 });
      expect(await stored()).toEqual(before);
    });

    test("recent responses resolve own bigint contact IDs but hide legacy foreign references", async () => {
      await client`insert into survey_response (survey_id, result_id, contact_id)
      values (${surveyId}, 'own-result', ${ownContact}), (${surveyId}, 'foreign-result', ${foreignContact})`;
      const rows = await surveys.loadRecentSurveyResponses(surveyId);
      expect(rows.find((row) => row.result_id === "own-result")).toMatchObject({
        contact_id: ownContact,
        contact: { id: ownContact, firstname: "Own" },
      });
      expect(
        rows.find((row) => row.result_id === "foreign-result"),
      ).toMatchObject({ contact_id: foreignContact, contact: null });
    });
  },
);
