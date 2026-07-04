import { describe, expect, test } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

describe("app/routes/api+/verify-pin-input/route.tsx", () => {
  test("always returns 410 retired response", async () => {
    const mod = await import("../app/routes/api+/verify-pin-input");
    const res = await asRouteResponse(
      await mod.action({ request: new Request("http://x", { method: "POST" }) } as any),
    );
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({
      error: "Audio PIN verification has been retired. Use call-in verification instead.",
    });
  });
});
