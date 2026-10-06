import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import ChatInput from "@/components/sms-ui/ChatInput";
import { useChatsPage } from "@/hooks/chats/useChatsPage";
import {
  createMockFetcher,
  createWorkspaceEventSourceMock,
} from "./hooks-test-helpers";

const toastMocks = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", async (importOriginal) => ({
  ...(await importOriginal<typeof import("sonner")>()),
  toast: toastMocks,
}));
const messageFetcher = createMockFetcher<
  { error?: string; billing?: { nextSendBlocked?: boolean } } | undefined
>();
const paginationFetcher = createMockFetcher();
const loader = {
  chats: [],
  chatsError: null,
  pagination: { page: 1, pageSize: 25, hasMore: false },
  potentialContacts: [],
  contact: null,
  campaigns: [],
  workspaceNumbers: [{ id: "n1", phone_number: "+15550000000" }],
  senderSelection: {
    defaultMode: "messaging_service",
    messagingServiceReady: true,
  },
  optOutKeywords: ["stop"],
};
let contactNumber = "+15551234567";
let phoneNumber = "";
let workspaceId = "ws1";
const setImages = vi.fn();
let images: string[] = [];
const addOptimisticMessage = vi.fn();
const markOptimisticMessageFailed = vi.fn();
vi.mock("@/hooks/contact/useContactSearch", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/hooks/contact/useContactSearch")
  >()),
  useContactSearch: () => ({
    selectedContact: null,
    isContactMenuOpen: false,
    searchError: null,
    contacts: [],
    phoneNumber,
    existingConversation: null,
    handleSearch: vi.fn(),
    toggleContactMenu: vi.fn(),
    isValid: Boolean(phoneNumber),
  }),
}));
vi.mock("@/hooks/chats/useImageHandling", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/chats/useImageHandling")>()),
  useImageHandling: () => ({
    selectedImages: images,
    setSelectedImages: setImages,
    handleImageSelect: vi.fn(),
    handleImageRemove: vi.fn(),
  }),
}));
const searchParams = new URLSearchParams();
const setSearchParams = vi.fn();
vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useOutletContext: () => ({ workspace: { id: workspaceId } }),
  useLoaderData: () => loader,
  useSearchParams: () => [searchParams, setSearchParams],
  useFetcher: ({ key }: { key?: string } = {}) =>
    key === "messages" ? messageFetcher : paginationFetcher,
  useOutlet: () => null,
  useParams: () => ({ contact_number: contactNumber }),
  useNavigate: () => vi.fn(),
}));
const Form = ({ children, ...props }: React.ComponentProps<"form">) =>
  createElement("form", props, children);
Object.assign(messageFetcher, { Form });
function Composer() {
  const h = useChatsPage();
  h.registerChatActions({ addOptimisticMessage, markOptimisticMessageFailed });
  return (
    <ChatInput
      key={h.contact_number || "new"}
      workspace={h.workspace}
      workspaceNumbers={h.chatInputWorkspaceNumbers}
      senderSelection={h.senderSelection}
      initialFrom={h.initialFrom}
      establishedFromNumber={h.establishedFromNumber}
      bodyValue={h.bodyValue}
      onBodyChange={h.onBodyChange}
      handleSubmit={h.handleSubmit}
      handleImageSelect={h.handleImageSelect}
      handleImageRemove={h.handleImageRemove}
      selectedImages={h.selectedImages}
      selectedContact={h.selectedContact}
      messageFetcher={h.messageFetcher}
      phoneNumber={h.contact_number || h.phoneNumber}
      isValid
    />
  );
}
beforeEach(() => {
  createWorkspaceEventSourceMock();
  contactNumber = "+15551234567";
  phoneNumber = "";
  workspaceId = "ws1";
  images = [];
  messageFetcher.state = "idle";
  messageFetcher.data = undefined;
  messageFetcher.submit.mockReset();
  setImages.mockReset();
  addOptimisticMessage.mockReset();
  markOptimisticMessageFailed.mockReset();
  toastMocks.error.mockReset();
  toastMocks.warning.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mount() {
  const view = render(<Composer />);
  const textarea = () =>
    screen.getByPlaceholderText<HTMLTextAreaElement>("Type your message");
  const type = (body: string) =>
    fireEvent.change(textarea(), { target: { value: body } });
  const send = () => {
    const form = textarea().closest("form");
    if (!form) throw new Error("Composer form is missing");
    fireEvent.submit(form);
  };
  const refresh = () => view.rerender(<Composer />);
  const start = () => {
    messageFetcher.state = "submitting";
    refresh();
  };
  const settle = (data: typeof messageFetcher.data) => {
    messageFetcher.state = "idle";
    messageFetcher.data = data;
    refresh();
  };
  return { textarea, type, send, refresh, start, settle };
}
test.each([
  ["long GSM text", "a".repeat(340), "34/153", "3 segments", "≈ 6 credits"],
  [
    "GSM single boundary",
    "a".repeat(160),
    "160/160",
    "1 segment",
    "≈ 2 credits",
  ],
  [
    "GSM multipart boundary",
    "a".repeat(161),
    "8/153",
    "2 segments",
    "≈ 4 credits",
  ],
  [
    "Unicode single boundary",
    "你".repeat(70),
    "70/70",
    "1 segment",
    "≈ 2 credits",
  ],
  [
    "Unicode multipart boundary",
    "你".repeat(71),
    "4/67",
    "2 segments",
    "≈ 4 credits",
  ],
  ["GSM extension units", "^".repeat(81), "9/153", "2 segments", "≈ 4 credits"],
])(
  "failed %s restores unchanged text and accurate metadata",
  (_, body, units, segments, credits) => {
    const c = mount();
    c.type(body);
    c.send();
    c.start();
    c.settle({ error: "Insufficient credits" });
    expect(c.textarea()).toHaveValue(body);
    expect(screen.getByText(units)).toBeInTheDocument();
    expect(screen.getByText(segments)).toBeInTheDocument();
    expect(screen.getByText(credits)).toBeInTheDocument();
    expect(markOptimisticMessageFailed).toHaveBeenCalledOnce();
  },
);
test("successful send clears text, counter and credits", () => {
  const c = mount();
  c.type("a".repeat(340));
  c.send();
  expect(c.textarea()).toHaveValue("");
  c.start();
  c.settle({});
  expect(c.textarea()).toHaveValue("");
  expect(screen.getByText("0/160")).toBeInTheDocument();
  expect(screen.getByText("≈ 0 credits")).toBeInTheDocument();
  expect(markOptimisticMessageFailed).not.toHaveBeenCalled();
});
test.each([true, false])(
  "preserves newer typing when the request settles (error=%s)",
  (error) => {
    const c = mount();
    c.type("a".repeat(340));
    c.send();
    c.start();
    c.type("Next draft");
    c.textarea().focus();
    c.textarea().setSelectionRange(3, 3);
    c.settle(error ? { error: "Send failed" } : {});
    expect(c.textarea()).toHaveValue("Next draft");
    expect(screen.getByText("10/160")).toBeInTheDocument();
    expect(c.textarea().selectionStart).toBe(3);
    expect(c.textarea()).toHaveFocus();
  },
);
test("restores at the end of the text and retains composer focus", () => {
  const c = mount();
  const body = "A message to retry";
  c.type(body);
  c.textarea().focus();
  c.send();
  c.start();
  c.settle({ error: "Send failed" });
  expect(c.textarea()).toHaveFocus();
  expect(c.textarea().selectionStart).toBe(body.length);
  expect(c.textarea().selectionEnd).toBe(body.length);
});
test("retains the draft when submission has no destination", () => {
  contactNumber = "";
  const c = mount();
  c.type("Keep this draft");
  c.send();
  expect(messageFetcher.submit).not.toHaveBeenCalled();
  expect(c.textarea()).toHaveValue("Keep this draft");
  expect(screen.getByText("15/160")).toBeInTheDocument();
});
test("retains a new draft when a second submission is refused before the fetcher starts", () => {
  const c = mount();
  c.type("First");
  c.send();
  c.type("Second");
  c.send();
  expect(messageFetcher.submit).toHaveBeenCalledOnce();
  expect(c.textarea()).toHaveValue("Second");
  c.start();
  c.settle({ error: "First failed" });
  expect(c.textarea()).toHaveValue("Second");
});
test("ignores idle re-renders and stale fetcher error data until the new request runs", () => {
  messageFetcher.data = { error: "Previous failure" };
  const c = mount();
  c.type("Retry draft");
  c.send();
  phoneNumber = "+15555550000";
  c.refresh();
  c.type("Newer draft");
  c.refresh();
  expect(toastMocks.error).not.toHaveBeenCalled();
  expect(markOptimisticMessageFailed).not.toHaveBeenCalled();
  c.start();
  c.settle({ error: "Current failure" });
  expect(toastMocks.error).toHaveBeenCalledExactlyOnceWith("Current failure");
  expect(c.textarea()).toHaveValue("Newer draft");
});
test("can restore, retry and restore again without consuming the previous result", () => {
  const c = mount();
  const body = "a".repeat(340);
  c.type(body);
  c.send();
  c.start();
  c.settle({ error: "First failure" });
  c.send();
  expect(c.textarea()).toHaveValue("");
  c.start();
  c.settle({ error: "Second failure" });
  expect(messageFetcher.submit).toHaveBeenCalledTimes(2);
  expect(c.textarea()).toHaveValue(body);
  expect(screen.getByText("≈ 6 credits")).toBeInTheDocument();
  c.send();
  c.start();
  c.settle({});
  expect(c.textarea()).toHaveValue("");
});
test.each(["conversation", "workspace", "new recipient"])(
  "does not restore a failed request into a different %s",
  (change) => {
    if (change === "new recipient") {
      contactNumber = "";
      phoneNumber = "+15551234567";
    }
    const c = mount();
    c.type("Original recipient");
    c.send();
    c.start();
    if (change === "conversation") contactNumber = "+15557654321";
    if (change === "workspace") workspaceId = "ws2";
    if (change === "new recipient") phoneNumber = "+15557654321";
    c.refresh();
    c.settle({ error: "Send failed" });
    expect(c.textarea()).toHaveValue("");
    expect(markOptimisticMessageFailed).not.toHaveBeenCalled();
  },
);
test("changing conversation resets its unsent draft", () => {
  const c = mount();
  c.type("Private draft");
  contactNumber = "+15557654321";
  c.refresh();
  expect(c.textarea()).toHaveValue("");
  contactNumber = "+15551234567";
  c.refresh();
  expect(c.textarea()).toHaveValue("");
});
test("retains the existing accepted MMS payload and flat media estimate", () => {
  images = ["https://cdn.example/image.png"];
  const c = mount();
  c.type("a".repeat(340));
  expect(screen.getByText("≈ 4 credits")).toBeInTheDocument();
  c.send();
  const data = messageFetcher.submit.mock.calls[0][0] as FormData;
  expect(data.get("body")).toBe("a".repeat(340));
  expect(data.get("media")).toBe('["https://cdn.example/image.png"]');
  expect(data.get("contact_number")).toBe("+15551234567");
  expect(data.get("from")).toBe("__messaging_service__");
  c.start();
  c.settle({ billing: { nextSendBlocked: true } });
  expect(toastMocks.warning).toHaveBeenCalledOnce();
  expect(markOptimisticMessageFailed).not.toHaveBeenCalled();
});

test.each([true, false])(
  "preserves a newer intentionally empty draft (error=%s)",
  (error) => {
    const c = mount();
    c.type("Old request");
    c.send();
    c.start();
    c.type("New draft");
    c.type("");
    c.settle(error ? { error: "Send failed" } : {});
    expect(c.textarea()).toHaveValue("");
    expect(screen.getByText("0/160")).toBeInTheDocument();
    expect(screen.getByText("≈ 0 credits")).toBeInTheDocument();
  },
);

test.each([true, false])(
  "handles a fresh result when the busy render is skipped (error=%s)",
  (error) => {
    messageFetcher.data = { error: "Old request" };
    const c = mount();
    const body = "a".repeat(340);
    c.type(body);
    c.send();
    c.settle(error ? { error: "Fast result" } : {});
    expect(c.textarea()).toHaveValue(error ? body : "");
    expect(
      screen.getByText(error ? "≈ 6 credits" : "≈ 0 credits"),
    ).toBeInTheDocument();
    if (!error) c.type(body);
    c.send();
    c.settle({ error: "Second result" });
    expect(messageFetcher.submit).toHaveBeenCalledTimes(2);
    expect(c.textarea()).toHaveValue(body);
  },
);
