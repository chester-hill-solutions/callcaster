import { describe, expect, it, vi } from "vitest";
import { createHandsetAccessToken } from "@/lib/handset/handset-token.server";

vi.mock("@/lib/env.server", () => ({
  env: {
    TWILIO_APP_SID: () => "APtest",
  },
}));

describe("createHandsetAccessToken", () => {
  it("returns error when workspace is missing credentials", async () => {
    const supabaseClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                twilio_data: { sid: "" },
                key: "",
                token: "",
              },
              error: null,
            }),
          }),
        }),
      }),
    } as never;

    const result = await createHandsetAccessToken({
      supabaseClient,
      workspaceId: "ws-1",
      clientIdentity: "handset-1",
    });

    expect(result.token).toBeNull();
    expect(result.error).toContain("Twilio credentials");
  });

  it("returns error when workspace is not found", async () => {
    const supabaseClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: { message: "not found" } }),
          }),
        }),
      }),
    } as never;

    const result = await createHandsetAccessToken({
      supabaseClient,
      workspaceId: "ws-missing",
      clientIdentity: "handset-1",
    });

    expect(result.token).toBeNull();
    expect(result.error).toBe("Workspace not found");
  });
});
