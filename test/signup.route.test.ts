import { describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(() => ({
    headers: new Headers(),
    supabaseClient: {},
  })),
  verifyAuth: vi.fn(),
}));

vi.mock("@/lib/supabase.server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
  verifyAuth: mocks.verifyAuth,
}));

describe("app/routes/signup.tsx", () => {
  test("rejects direct signup POST when registration is invite-only", async () => {
    const mod = await import("../app/routes/signup");
    const response = await mod.action({
      request: new Request("http://localhost/signup", { method: "POST" }),
    } as any);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(403);
    await expect((response as Response).json()).resolves.toMatchObject({
      error: expect.stringContaining("invite-only"),
    });
  });
});
