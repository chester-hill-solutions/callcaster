import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "../helpers/route-result";

const mocks = vi.hoisted(() => {
  return {
    loaderData: null as any,
    navbarProps: null as any,
    routeError: null as any,
    isRouteErrorResponse: vi.fn(() => false),
    navigate: vi.fn(),
    unsubscribe: vi.fn(),
    logger: { error: vi.fn() , info: vi.fn(), debug: vi.fn()},
    envUtil: {
      BETTER_AUTH_URL: vi.fn(() => "http://client"),
      BETTER_AUTH_PUBLISHABLE_KEY: vi.fn(() => "pk"),
      BASE_URL: vi.fn(() => "http://base"),
    },
    getSession: vi.fn(),
    createBrowserClient: vi.fn(),
    workspaceMembersDb: {
      loadUserWithInvites: vi.fn(async () => ({ id: "u1" })),
      listUserWorkspaceSummaries: vi.fn(async () => [{ id: "w1", name: "W" }] as any[]),
    },
  };
});

vi.mock("@/tailwind.css?url", () => ({ default: "/tailwind.css" }));

vi.mock("@/components/layout/Navbar", () => ({
  default: (props: any) => {
    mocks.navbarProps = props;
    return null;
  },
}));

vi.mock("@/components/shared/ErrorBoundary", () => ({
  ErrorBoundary: () => null,
}));

vi.mock("@/lib/env.server", () => ({ env: mocks.envUtil }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/auth.server", () => ({
  getSession: (...args: any[]) =>
    mocks.getSession(...args),
  resolveBearerSessionUser: vi.fn(),
}));

vi.mock("@client/ssr", () => ({
  createBrowserClient: (...args: any[]) => mocks.createBrowserClient(...args),
}));

vi.mock("@/lib/workspace-members-db.server", () => ({
  loadUserWithInvites: (...args: any[]) => mocks.workspaceMembersDb.loadUserWithInvites(...args),
  listUserWorkspaceSummaries: (...args: any[]) => mocks.workspaceMembersDb.listUserWorkspaceSummaries(...args),
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    Links: () => null,
    Meta: () => null,
    Outlet: () => null,
    Scripts: () => null,
    ScrollRestoration: () => null,
    useLoaderData: () => mocks.loaderData,
    useNavigate: () => mocks.navigate,
    useNavigation: () => ({ state: "idle" }),
    useRouteError: () => mocks.routeError,
    isRouteErrorResponse: (error: unknown) => mocks.isRouteErrorResponse(error),
  };
});

describe("root.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.navbarProps = null;
    mocks.routeError = null;
    mocks.isRouteErrorResponse.mockReset();
    mocks.isRouteErrorResponse.mockReturnValue(false);
    mocks.navigate.mockReset();
    mocks.unsubscribe.mockReset();
    mocks.logger.error.mockReset();
    mocks.envUtil.BETTER_AUTH_URL.mockClear();
    mocks.envUtil.BETTER_AUTH_PUBLISHABLE_KEY.mockClear();
    mocks.envUtil.BASE_URL.mockClear();
    mocks.getSession.mockReset();
    mocks.createBrowserClient.mockReset();
    mocks.workspaceMembersDb.loadUserWithInvites.mockReset();
    mocks.workspaceMembersDb.listUserWorkspaceSummaries.mockReset();
    mocks.workspaceMembersDb.loadUserWithInvites.mockResolvedValue({
      id: "u1",
      first_name: "Ada",
      username: "ada",
      workspace_invite: [{ id: "invite-1" }],
    });
    mocks.workspaceMembersDb.listUserWorkspaceSummaries.mockResolvedValue([{ id: "w1", name: "W" }] as any[]);
  });

  test("links includes stylesheet", async () => {
    const mod = await import("../../app/root");
    expect(mod.links()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rel: "stylesheet", href: expect.stringContaining("tailwind") }),
      ]),
    );
  });

  test("loader redirects when q decodes to contactId:surveyId", async () => {
    const mod = await import("../../app/root");
    const q = btoa("10:20");
    const res = await asRouteResponse(mod.loader({
      request: new Request(`http://x/?q=${encodeURIComponent(q)}`),
      params: {},
    } as any));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/survey/20?contact=10");
  });

  test("loader does not redirect when decoded q is missing contactId or surveyId", async () => {
    mocks.getSession.mockReturnValueOnce({ session: null, user: null, headers: new Headers() });

    const mod = await import("../../app/root");
    const q = btoa("10:");
    const res = await asRouteResponse(mod.loader({
      request: new Request(`http://x/?q=${encodeURIComponent(q)}`),
      params: {},
    } as any));
    expect(res.status).toBe(200);
  });

  test("loader logs when q decode fails and continues; no-user returns workspaces null", async () => {
    mocks.getSession.mockReturnValueOnce({ session: null, user: null, headers: new Headers({ "Set-Cookie": "a=1" }) });

    const mod = await import("../../app/root");
    const res = await asRouteResponse(mod.loader({
      request: new Request("http://x/?q=not-base64"),
      params: { id: "x" },
    } as any));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isSignedIn).toBe(false);
    expect(body.session).toBeUndefined();
    expect(body.env).toBeUndefined();
    expect(body.workspaces).toBeNull();
    expect(body.user).toBeNull();
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Failed to decode survey link:",
      expect.anything()
    );
  });

  test("loader with user projects navbar-safe fields without session token", async () => {
    mocks.getSession.mockReturnValueOnce({ session: { token: "secret-token" }, user: { id: "u1" }, headers: new Headers() });

    const mod = await import("../../app/root");
    const res = await asRouteResponse(mod.loader({
      request: new Request("http://x/"),
      params: {},
    } as any));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      isSignedIn: true,
      workspaces: [{ id: "w1", name: "W" }],
      user: {
        id: "u1",
        first_name: "Ada",
        username: "ada",
        workspace_invite: [{ id: "invite-1" }],
      },
      params: {},
    });
    expect(mocks.logger.error).not.toHaveBeenCalledWith(
      "Error loading workspaces or user data",
      expect.anything()
    );
  });

  test("loader with user loads user/workspaces and logs when errors present", async () => {
    mocks.workspaceMembersDb.loadUserWithInvites.mockRejectedValueOnce(new Error("u"));
    mocks.workspaceMembersDb.listUserWorkspaceSummaries.mockRejectedValueOnce(new Error("w"));
    mocks.getSession.mockReturnValueOnce({ session: { token: "t" }, user: { id: "u1" }, headers: new Headers() });

    const mod = await import("../../app/root");
    const res = await asRouteResponse(mod.loader({
      request: new Request("http://x/"),
      params: {},
    } as any));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isSignedIn).toBe(true);
    expect(body.user).toBeNull();
    expect(body.workspaces).toBeNull();
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Error loading workspaces or user data",
      expect.anything()
    );
  });

  test("App signOut returns error json when client signOut fails; covers PASSWORD_RECOVERY branch and cleanup", async () => {
    const auth = {
      signOut: vi.fn(async () => ({ error: { message: "bad" } })),
      onAuthStateChange: vi.fn((cb: any) => {
        cb("PASSWORD_RECOVERY", null);
        return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
      }),
    };
    mocks.createBrowserClient.mockReturnValueOnce({ auth });
    mocks.loaderData = {
      isSignedIn: true,
      workspaces: [],
      user: null,
      params: {},
    };

    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));

    const mod = await import("../../app/root");
    document.documentElement.innerHTML = "";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(<mod.default />, { container: document.documentElement });
    consoleError.mockRestore();
    expect(mocks.navbarProps.isSignedIn).toBe(true);

    const r = await mocks.navbarProps.handleSignOut();
    expect(r).toEqual({ success: null, error: "Sign out failed" });

    unmount();
  });

  test("App signOut navigates and returns success when signOut ok; covers non-PASSWORD_RECOVERY branch", async () => {
    const auth = {
      signOut: vi.fn(async () => ({ error: null })),
      onAuthStateChange: vi.fn((cb: any) => {
        cb("SIGNED_IN", null);
        return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
      }),
    };
    mocks.createBrowserClient.mockReturnValueOnce({ auth });
    mocks.loaderData = {
      isSignedIn: false,
      workspaces: null,
      user: { id: "u1", first_name: null, username: "u", workspace_invite: [] },
      params: {},
    };

    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));

    const mod = await import("../../app/root");
    document.documentElement.innerHTML = "";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<mod.default />, { container: document.documentElement });
    consoleError.mockRestore();

    const r = await mocks.navbarProps.handleSignOut();
    expect(r).toEqual({ success: "Sign off successful", error: null });
    expect(mocks.navigate).toHaveBeenCalledWith("/");
  });

  async function renderErrorBoundary() {
    const mod = await import("../../app/root");
    document.documentElement.innerHTML = "";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<mod.ErrorBoundary />, { container: document.documentElement });
    consoleError.mockRestore();
    const head = document.documentElement.querySelector("head");
    expect(head).not.toBeNull();
    return head as HTMLHeadElement;
  }

  // The error document bootstraps the same client route graph as App, and
  // csv-parse reads Buffer at module scope — without the polyfill every 404
  // dies with "Buffer is not defined".
  test("404 error document loads the Buffer polyfill", async () => {
    mocks.routeError = { status: 404, statusText: "Not Found", data: null };
    mocks.isRouteErrorResponse.mockReturnValue(true);

    const head = await renderErrorBoundary();
    expect(head.querySelector('script[src="/buffer-polyfill.mjs"]')).not.toBeNull();
  });

  test("unexpected-error document loads the Buffer polyfill", async () => {
    mocks.routeError = new Error("boom");

    const head = await renderErrorBoundary();
    expect(head.querySelector('script[src="/buffer-polyfill.mjs"]')).not.toBeNull();
  });
});

