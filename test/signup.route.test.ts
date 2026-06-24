import { describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(() => ({
    headers: new Headers(),
    supabaseClient: {
      auth: {
        getSession: vi.fn(async () => ({ data: { session: null } })),
      },
    },
  })),
  registerUser: vi.fn(),
}));

vi.mock("@/lib/supabase.server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

vi.mock("@/lib/platform-auth.server", () => ({
  registerUser: mocks.registerUser,
}));

describe("app/routes/signup/route.tsx", () => {
  test("accepts direct signup POST with form data", async () => {
    mocks.registerUser.mockResolvedValueOnce({
      ok: true,
      data: { user: { id: "u1" } },
    });

    const form = new FormData();
    form.set("email", "user@example.com");
    form.set("password", "secret123");

    const mod = await import("../app/routes/signup");
    const response = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/signup", {
        method: "POST",
        body: form,
      }),
    } as any));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mocks.registerUser).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        email: "user@example.com",
        password: "secret123",
      }),
    );
  });
});
