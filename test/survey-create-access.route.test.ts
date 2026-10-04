import { describe, expect, test } from "vitest";
import { loader } from "../app/routes/workspaces+/$id/surveys/new.loader.server";
import { withWorkspaceRouteArgs } from "./helpers/route-context-mock";
import { asRouteResponse } from "./helpers/route-result";

async function routeArgs(userRole: string) {
  return withWorkspaceRouteArgs(
    {
      request: new Request("http://localhost/workspaces/ws-1/surveys/new"),
      params: { id: "ws-1" },
    },
    { userRole, workspaceId: "ws-1", userId: "user-1" },
  );
}

describe("new survey route role floor (#2004)", () => {
  test("the actual loader denies a caller with 403", async () => {
    await expect(loader(await routeArgs("caller"))).rejects.toMatchObject({
      status: 403,
    });
  });

  test.each(["member", "admin", "owner"])(
    "the actual loader permits a %s",
    async (role) => {
      const response = await asRouteResponse(loader(await routeArgs(role)));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        workspaceId: "ws-1",
        user: { id: "user-1" },
        userRole: role,
      });
    },
  );
});
