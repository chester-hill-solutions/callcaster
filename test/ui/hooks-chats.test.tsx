import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createMockFetcher,
  createSupabaseRealtimeMock,
  installIntersectionObserverMock,
} from "./hooks-test-helpers";

vi.mock("@/lib/logger.client", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const imageFetcher = createMockFetcher({ state: "idle", data: { success: true, url: "https://img" } });
const olderFetcher = createMockFetcher({ state: "idle" });

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useFetcher: ({ key }: { key?: string } = {}) => {
      if (key === "images") return imageFetcher;
      return olderFetcher;
    },
    useLoaderData: () => ({
      messages: [{ sid: "m1", body: "hi", date_created: new Date().toISOString(), status: "received", direction: "inbound", from: "+1", to: "+2" }],
      hasMore: false,
      contact_number: "+15551234567",
      optOutKeywords: ["stop"],
    }),
    useParams: () => ({ contact_number: encodeURIComponent("+15551234567") }),
    useLocation: () => ({ pathname: "/workspaces/ws/chats/+15551234567" }),
  };
});

describe("chats hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installIntersectionObserverMock();
    document.body.innerHTML = '<input id="image" type="file" />';
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("useImageHandling uploads and removes images", async () => {
    const { useImageHandling } = await import("@/hooks/chats/useImageHandling");
    const { result } = renderHook(() => useImageHandling("ws"));

    const file = new File(["x"], "a.png", { type: "image/png" });
    act(() => {
      result.current.handleImageSelect({
        target: { files: [file] },
      } as React.ChangeEvent<HTMLInputElement>);
    });
    expect(result.current.selectedImages).toContain("https://img");

    act(() => result.current.handleImageRemove("https://img"));
    expect(result.current.selectedImages).not.toContain("https://img");
  });

  test("useChatThread registers actions and exposes messages", async () => {
    const { supabase } = createSupabaseRealtimeMock();
    const { useChatThread } = await import("@/hooks/chats/useChatThread");
    const registerChatActions = vi.fn();

    const { result } = renderHook(() =>
      useChatThread({
        supabase: supabase as never,
        workspace: { id: "ws" } as never,
        registerChatActions,
      }),
    );

    expect(registerChatActions).toHaveBeenCalled();
    expect(result.current.messages.length).toBeGreaterThan(0);
  });
});
