import { afterEach, describe, expect, it, vi } from "vitest";
import Twilio from "twilio";
import RequestClient from "twilio/lib/base/RequestClient";
import Response from "twilio/lib/http/response";
import { collectResources } from "../scripts/lib/twilio-prune-resources.mjs";

const PARENT = "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CHILD = "ACbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const CHILD_SERVICE = "MGbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const LAST_SERVICE = "MGffffffffffffffffffffffffffffffff";

function account(sid = CHILD, authToken = "child-token") {
  return {
    sid,
    auth_token: authToken,
    friendly_name: "Sample workspace",
    status: "active",
  };
}

interface FixtureOptions {
  accounts?: ReturnType<typeof account>[];
  services?: { sid: string; friendly_name: string }[];
  failServicesFor?: "parent" | "child";
}

function fixture({
  accounts = [account()],
  services,
  failServicesFor,
}: FixtureOptions = {}) {
  const tokens = new Map(
    accounts.map((entry) => [entry.sid, entry.auth_token]),
  );
  tokens.set(PARENT, "parent-token");
  const httpClient = new RequestClient();
  const request = vi
    .spyOn(httpClient, "request")
    .mockImplementation(async (options) => {
      expect(options.method.toLowerCase()).toBe("get");
      const url = new URL(options.uri);
      if (url.pathname === "/2010-04-01/Accounts.json") {
        const secondPage = url.searchParams.has("PageToken");
        return new Response(
          200,
          {
            accounts: secondPage ? accounts.slice(200) : accounts.slice(0, 200),
            next_page_uri:
              !secondPage && accounts.length > 200
                ? "/2010-04-01/Accounts.json?PageToken=accounts-2"
                : null,
          },
          {},
        );
      }
      if (
        url.hostname === "messaging.twilio.com" &&
        url.pathname === "/v1/Services"
      ) {
        const isParent = options.username === PARENT;
        const expectedToken = tokens.get(String(options.username));
        if (expectedToken === undefined || options.password !== expectedToken)
          return new Response(
            401,
            { code: 20003, message: "Authentication failed" },
            {},
          );
        if (
          (isParent && failServicesFor === "parent") ||
          (!isParent && failServicesFor === "child")
        ) {
          return new Response(
            503,
            { code: 20503, message: "Service unavailable" },
            {},
          );
        }
        const entries = isParent
          ? []
          : (services ?? [{ sid: CHILD_SERVICE, friendly_name: "Follow-up" }]);
        const secondPage = url.searchParams.has("PageToken");
        return new Response(
          200,
          {
            services: secondPage ? entries.slice(1000) : entries.slice(0, 1000),
            meta: {
              next_page_url:
                !secondPage && entries.length > 1000
                  ? "https://messaging.twilio.com/v1/Services?PageToken=services-2"
                  : null,
            },
          },
          {},
        );
      }
      if (url.pathname.endsWith("/Applications.json")) {
        return new Response(200, { applications: [], next_page_uri: null }, {});
      }
      if (url.pathname.endsWith("/IncomingPhoneNumbers.json")) {
        return new Response(
          200,
          { incoming_phone_numbers: [], next_page_uri: null },
          {},
        );
      }
      return new Response(
        404,
        { code: 20404, message: "Resource not found" },
        {},
      );
    });
  return {
    client: new Twilio.Twilio(PARENT, "parent-token", { httpClient }),
    request,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("Twilio prune resource scan", () => {
  it("reads a subaccount Messaging Service with the real SDK and subaccount credentials", async () => {
    const { client } = fixture();
    const resources = await collectResources(client, {
      skipSubaccounts: false,
    });
    expect(resources).toContainEqual({
      resourceType: "messaging_service",
      sid: CHILD_SERVICE,
      friendlyName: "Follow-up",
      scope: "subaccount",
    });
    expect(JSON.stringify(resources)).not.toContain("child-token");
  });

  it("includes subaccounts beyond the old 200-account cutoff", async () => {
    const accounts = Array.from({ length: 201 }, (_, index) =>
      account(
        `AC${index.toString(16).padStart(32, "0")}`,
        `child-token-${index}`,
      ),
    );
    const { client, request } = fixture({ accounts, services: [] });
    const resources = await collectResources(client, {
      skipSubaccounts: false,
    });
    expect(
      resources.filter(
        (entry: { resourceType: string }) =>
          entry.resourceType === "subaccount",
      ),
    ).toHaveLength(201);
    expect(
      request.mock.calls.some(
        ([options]) =>
          options.username === "AC000000000000000000000000000000c8" &&
          options.uri.startsWith("https://messaging.twilio.com/v1/Services"),
      ),
    ).toBe(true);
  });

  it("includes services beyond the old 1,000-resource cutoff", async () => {
    const services = Array.from({ length: 1000 }, (_, index) => ({
      sid: `MG${index.toString(16).padStart(32, "0")}`,
      friendly_name: "Existing service",
    }));
    services.push({ sid: LAST_SERVICE, friendly_name: "Last page" });
    const { client } = fixture({ services });
    const resources = await collectResources(client, {
      skipSubaccounts: false,
    });
    expect(
      resources.filter(
        (entry: { resourceType: string }) =>
          entry.resourceType === "messaging_service",
      ),
    ).toHaveLength(1001);
    expect(resources).toContainEqual({
      resourceType: "messaging_service",
      sid: LAST_SERVICE,
      friendlyName: "Last page",
      scope: "subaccount",
    });
  });

  it("fails an unreadable parent service list instead of reporting it as empty", async () => {
    const { client } = fixture({ failServicesFor: "parent" });
    await expect(
      collectResources(client, { skipSubaccounts: false }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("identifies the subaccount when its service list cannot be read", async () => {
    const { client } = fixture({ failServicesFor: "child" });
    const scan = collectResources(client, { skipSubaccounts: false });
    await expect(scan).rejects.toMatchObject({
      message: expect.stringContaining(CHILD),
      cause: { status: 503 },
    });
    await expect(scan).rejects.toThrow("active");
  });

  it("refuses to fall back to parent credentials when the subaccount token is missing", async () => {
    const { client } = fixture({ accounts: [account(CHILD, "")] });
    await expect(
      collectResources(client, { skipSubaccounts: false }),
    ).rejects.toThrow("no Auth Token returned");
  });

  it("keeps the parent-only scan from reading subaccount resources", async () => {
    const { client, request } = fixture();
    const resources = await collectResources(client, { skipSubaccounts: true });
    expect(resources).toContainEqual({
      resourceType: "subaccount",
      sid: CHILD,
      friendlyName: "Sample workspace",
      scope: "subaccount",
    });
    expect(
      request.mock.calls.every(([options]) => options.username === PARENT),
    ).toBe(true);
    expect(
      resources.some(
        (entry: { scope: string }) =>
          entry.scope === "subaccount" &&
          "resourceType" in entry &&
          entry.resourceType === "messaging_service",
      ),
    ).toBe(false);
  });
});
