import { act, renderHook } from "@testing-library/react";
import type { FormEvent } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createMockFetcher,
  createWorkspaceEventSourceMock,
} from "./hooks-test-helpers";

const messageFetcher = createMockFetcher<{ error?: string } | undefined>({
  state: "idle",
  data: undefined,
});
// Stable (module-scoped) so re-renders of the hook see the same object
// identity across calls to useLoaderData/useFetcher — otherwise the
// loaderData-sync effects in useChatsPage would see new references every
// render and loop forever.
const paginationFetcher = createMockFetcher();
const stableLoaderData = {
  chats: [] as unknown[],
  chatsError: null,
  pagination: { page: 1, pageSize: 25, hasMore: false },
  potentialContacts: [] as unknown[],
  contact: null,
  campaigns: [] as unknown[],
  workspaceNumbers: [{ id: "n1", phone_number: "+15550000000" }],
  senderSelection: {
    defaultMode: "messaging_service" as const,
    messagingServiceReady: true,
  },
  optOutKeywords: ["stop"],
};

vi.mock("@/hooks/contact/useContactSearch", () => ({
  useContactSearch: () => ({
    selectedContact: null,
    isContactMenuOpen: false,
    searchError: null,
    contacts: [],
    phoneNumber: "",
    existingConversation: null,
    handleSearch: vi.fn(),
    toggleContactMenu: vi.fn(),
    isValid: false,
  }),
}));

vi.mock("@/hooks/chats/useImageHandling", () => ({
  useImageHandling: () => ({
    selectedImages: [],
    setSelectedImages: vi.fn(),
    handleImageSelect: vi.fn(),
    handleImageRemove: vi.fn(),
  }),
}));

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useOutletContext: () => ({ workspace: { id: "ws1" } }),
    useLoaderData: () => stableLoaderData,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useFetcher: ({ key }: { key?: string } = {}) =>
      key === "messages" ? messageFetcher : paginationFetcher,
    useOutlet: () => null,
    useParams: () => ({ contact_number: "+15551234567" }),
    useNavigate: () => vi.fn(),
  };
});

describe("useChatsPage optimistic failure handling", () => {
  beforeEach(() => {
    createWorkspaceEventSourceMock();
    messageFetcher.state = "idle";
    messageFetcher.data = undefined;
    document.body.innerHTML =
      '<form><textarea name="body" id="body"></textarea></form>';
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("flips the pending optimistic message to failed and restores composer text when the fetcher errors", async () => {
    const { useChatsPage } = await import("@/hooks/chats/useChatsPage");
    const { result, rerender } = renderHook(() => useChatsPage());

    const addOptimisticMessage = vi.fn();
    const markOptimisticMessageFailed = vi.fn();
    act(() => {
      result.current.registerChatActions({
        addOptimisticMessage,
        markOptimisticMessageFailed,
      });
    });

    const form = document.querySelector("form") as HTMLFormElement;
    const textarea = document.getElementById("body") as HTMLTextAreaElement;
    textarea.value = "hello there";

    const fakeEvent = {
      preventDefault: vi.fn(),
      currentTarget: form,
    } as unknown as FormEvent<HTMLFormElement>;

    act(() => {
      result.current.handleSubmit(fakeEvent);
    });

    expect(fakeEvent.preventDefault).toHaveBeenCalled();
    expect(addOptimisticMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "hello there",
        from: undefined,
        sid: expect.any(String),
      }),
    );
    // Composer is cleared immediately on submit.
    expect(textarea.value).toBe("");

    const pendingSid = addOptimisticMessage.mock.calls[0]?.[0]?.sid as string;
    expect(pendingSid).toMatch(/^pending-/);

    // Simulate the fetcher completing with a credit/Twilio error.
    messageFetcher.data = { error: "Insufficient credits" };
    rerender();

    expect(markOptimisticMessageFailed).toHaveBeenCalledWith(pendingSid);
    // Text is restored into the composer so the user can retry.
    expect(textarea.value).toBe("hello there");
  });

  test("does not touch the composer or mark failure when the fetcher succeeds", async () => {
    const { useChatsPage } = await import("@/hooks/chats/useChatsPage");
    const { result, rerender } = renderHook(() => useChatsPage());

    const addOptimisticMessage = vi.fn();
    const markOptimisticMessageFailed = vi.fn();
    act(() => {
      result.current.registerChatActions({
        addOptimisticMessage,
        markOptimisticMessageFailed,
      });
    });

    const form = document.querySelector("form") as HTMLFormElement;
    const textarea = document.getElementById("body") as HTMLTextAreaElement;
    textarea.value = "all good";

    const fakeEvent = {
      preventDefault: vi.fn(),
      currentTarget: form,
    } as unknown as FormEvent<HTMLFormElement>;

    act(() => {
      result.current.handleSubmit(fakeEvent);
    });

    messageFetcher.data = { error: undefined };
    rerender();

    expect(markOptimisticMessageFailed).not.toHaveBeenCalled();
    expect(textarea.value).toBe("");
  });
});
