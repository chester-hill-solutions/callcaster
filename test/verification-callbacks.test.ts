import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse, routeArgs } from "./helpers/route-result";
const boundary = vi.hoisted(() => ({ verifyEmail: vi.fn() }));
vi.mock("@/server/auth-instance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth-instance")>()),
  auth: { api: boundary },
}));

const callbacks = [
  {
    name: "API verification",
    path: "/api/auth/callback",
    load: () => import("../app/routes/api+/auth/callback.loader.server"),
  },
  {
    name: "public verification",
    path: "/auth/confirm",
    load: () => import("../app/routes/auth/confirm.loader.server"),
  },
];
for (const { name, path, load } of callbacks)
  describe(name, () => {
    beforeEach(() => {
      boundary.verifyEmail.mockReset();
    });
    test("missing verification parameters return to registered sign-in without leaking a reset token", async () => {
      const { loader } = await load();
      const response = await asRouteResponse(
        loader(
          routeArgs(new Request(`http://localhost${path}?token=reset-secret`)),
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/signin");
      expect(boundary.verifyEmail).not.toHaveBeenCalled();
    });
    test("rejected verification returns to sign-in without token query parameters", async () => {
      boundary.verifyEmail.mockRejectedValue(new Error("Invalid verification"));
      const { loader } = await load();
      const response = await asRouteResponse(
        loader(
          routeArgs(
            new Request(
              `http://localhost${path}?token_hash=verification-secret&type=signup`,
            ),
          ),
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/signin");
    });
    test("successful verification keeps cookies and a safe return path", async () => {
      boundary.verifyEmail.mockResolvedValue({
        response: { user: { id: "verified-user" } },
        headers: new Headers({
          "Set-Cookie": "session=verified; HttpOnly; Path=/",
        }),
      });
      const { loader } = await load();
      const response = await asRouteResponse(
        loader(
          routeArgs(
            new Request(
              `http://localhost${path}?token_hash=valid&type=signup&next=%2Fworkspaces`,
            ),
          ),
        ),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/workspaces");
      expect(response.headers.get("Set-Cookie")).toContain("session=verified");
    });
  });
