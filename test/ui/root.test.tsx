import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "../helpers/route-result";

const mocks = vi.hoisted(() => {
  return {
    loaderData: null as any,
    navbarProps: null as any,
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
}));

vi.mock("@client/ssr", () => ({
  createBrowserClient: (...args: any[]) => mocks.createBrowserClient(...args),
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
    useRouteError: () => null,
    isRouteErrorResponse: () => false,
  };
});

describe("root.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.navbarProps = null;
    mocks.navigate.mockReset();
    mocks.unsubscribe.mockReset();
    mocks.logger.error.mockReset();
    mocks.envUtil.BETTER_AUTH_URL.mockClear();
    mocks.envUtil.BETTER_AUTH_PUBLISHABLE_KEY.mockClear();
    mocks.envUtil.BASE_URL.mockClear();
    mocks.getSession.mockReset();
    mocks.createBrowserClient.mockReset();
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
    const res = await asRouteResponse(await mod.loader({
      request: new Request(`http://x/?q=${encodeURIComponent(q)}`),
      params: {},
    } as any));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/survey/20?contact=10");
  });

  test("loader does not redirect when decoded q is missing contactId or surveyId", async () => {
    const client = {
      auth: {
        getSession: vi.fn(async () => ({ data: { session: { access_token: null } } })),
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
    };
    mocks.getSession.mockReturnValueOnce({ headers: new Headers(),
    });

    const mod = await import("../../app/root");
    const q = btoa("10:");
    const res = await asRouteResponse(await mod.loader({
      request: new Request(`http://x/?q=${encodeURIComponent(q)}`),
      params: {},
    } as any));
    expect(res.status).toBe(200);
  });

  test("loader logs when q decode fails and continues; no-user returns workspaces null", async () => {
    const client = {
      auth: {
        getSession: vi.fn(async () => ({ data: { session: { access_token: null } } })),
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
    };
    mocks.getSession.mockReturnValueOnce({ headers: new Headers({ "Set-Cookie": "a=1" }),
    });

    const mod = await import("../../app/root");
    const res = await asRouteResponse(await mod.loader({
      request: new Request("http://x/?q=not-base64"),
      params: { id: "x" },
    } as any));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workspaces).toBeNull();
    expect(body.user).toBeNull();
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Failed to decode survey link:",
      expect.anything()
    );
  });

  test("loader with user and no errors does not log errors", async () => {
    const client = {
      auth: {
        getSession: vi.fn(async () => ({ data: { session: { access_token: "t" } } })),
        getUser: vi.fn(async () => ({ data: { user: { id: "u1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "user") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { id: "u1" }, error: null }),
              }),
            }),
          };
        }
        if (table === "workspace_users") {
          return {
            select: () => ({
              eq: () => ({
                order: async () => ({
                  data: [{ workspace: { id: "w1", name: "W" } }],
                  error: null,
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };
    mocks.getSession.mockReturnValueOnce({ headers: new Headers(),
    });

    const mod = await import("../../app/root");
    const res = await asRouteResponse(await mod.loader({
      request: new Request("http://x/"),
      params: {},
    } as any));
    expect(res.status).toBe(200);
    expect(mocks.logger.error).not.toHaveBeenCalledWith(
      "Error loading workspaces or user data",
      expect.anything()
    );
  });

  test("loader with user loads user/workspaces and logs when errors present", async () => {
    const client = {
      auth: {
        getSession: vi.fn(async () => ({ data: { session: { access_token: "t" } } })),
        getUser: vi.fn(async () => ({ data: { user: { id: "u1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "user") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { id: "u1" }, error: { message: "u" } }),
              }),
            }),
          };
        }
        if (table === "workspace_users") {
          return {
            select: () => ({
              eq: () => ({
                order: async () => ({
                  data: [{ workspace: { id: "w1", name: "W" } }],
                  error: { message: "w" },
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };
    mocks.getSession.mockReturnValueOnce({ headers: new Headers(),
    });

    const mod = await import("../../app/root");
    const res = await asRouteResponse(await mod.loader({
      request: new Request("http://x/"),
      params: {},
    } as any));
    const body = await res.json();
    expect(body.workspaces).toEqual([{ id: "w1", name: "W" }]);
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
      env: { BETTER_AUTH_URL: "http://client", BETTER_AUTH_KEY: "pk", BASE_URL: "http://base" },
      session: { access_token: "t" },
      workspaces: [],
      user: null,
      params: {},
    };

    const mod = await import("../../app/root");
    document.documentElement.innerHTML = "";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(<mod.default />, { container: document.documentElement });
    consoleError.mockRestore();
    expect(mocks.navbarProps.isSignedIn).toBe(true);

    const r = await mocks.navbarProps.handleSignOut();
    expect(r).toEqual({ success: null, error: "bad" });
    expect(mocks.navigate).toHaveBeenCalledWith("/reset");

    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalled();
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
      env: { BETTER_AUTH_URL: "http://client", BETTER_AUTH_KEY: "pk", BASE_URL: "http://base" },
      session: { access_token: null },
      workspaces: null,
      user: { id: "u1" },
      params: {},
    };

    const mod = await import("../../app/root");
    document.documentElement.innerHTML = "";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<mod.default />, { container: document.documentElement });
    consoleError.mockRestore();

    const r = await mocks.navbarProps.handleSignOut();
    expect(r).toEqual({ success: "Sign off successful", error: null });
    expect(mocks.navigate).toHaveBeenCalledWith("/");
  });
});

