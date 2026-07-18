import { describe, expect, test } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

describe("app/routes/api+/verify-audio-pin/$pin/route.tsx", () => {
  test("loader returns retired 410 response", async () => {
    const mod = await import("../app/routes/api+/verify-audio-pin/$pin.route");
    const res = await asRouteResponse(
      mod.loader({ request: new Request("http://x/api/verify-audio-pin/123456") } as any),
    );

    expect(res.status).toBe(410);
    await expect(res.json()).resolves.toEqual({
      error: "Audio PIN verification has been retired. Use call-in verification instead.",
    });
  });
});
