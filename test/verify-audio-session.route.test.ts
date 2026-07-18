import { describe, expect, test } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

describe("app/routes/api+/verify-audio-session/route.tsx", () => {
  test("loader returns retired 410 response", async () => {
    const mod = await import("../app/routes/api+/verify-audio-session");
    const res = await asRouteResponse(mod.loader({
      request: new Request("http://x/api/verify-audio-session?workspace_id=w1&phoneNumber=15551234567&fromNumber=15551234567"),
    } as any));
    expect(res.status).toBe(410);
    await expect(res.json()).resolves.toEqual({
      error: "Audio PIN verification has been retired. Use call-in verification instead.",
    });
  });

  test("action returns retired 410 response", async () => {
    const mod = await import("../app/routes/api+/verify-audio-session");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(410);
    await expect(res.json()).resolves.toEqual({
      error: "Audio PIN verification has been retired. Use call-in verification instead.",
    });
  });
});
