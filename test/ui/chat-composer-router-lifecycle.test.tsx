import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  createMemoryRouter,
  Outlet,
  redirect,
  RouterProvider,
} from "react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import ChatInput from "@/components/sms-ui/ChatInput";
import { useChatsPage } from "@/hooks/chats/useChatsPage";
import { createWorkspaceEventSourceMock } from "./hooks-test-helpers";

const toastMocks = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", async (importOriginal) => ({
  ...(await importOriginal<typeof import("sonner")>()),
  toast: toastMocks,
}));
vi.mock("@/hooks/contact/useContactSearch", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/hooks/contact/useContactSearch")
  >()),
  useContactSearch: () => ({
    selectedContact: null,
    isContactMenuOpen: false,
    searchError: null,
    contacts: [],
    phoneNumber: newPhoneNumber,
    existingConversation: null,
    handleSearch: vi.fn(),
    toggleContactMenu: vi.fn(),
    isValid: false,
  }),
}));
vi.mock("@/hooks/chats/useImageHandling", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/chats/useImageHandling")>()),
  useImageHandling: () => ({
    selectedImages: [],
    setSelectedImages: vi.fn(),
    handleImageSelect: vi.fn(),
    handleImageRemove: vi.fn(),
  }),
}));
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
let newPhoneNumber = "";
const failed = vi.fn();
function Composer() {
  const h = useChatsPage();
  h.registerChatActions({ markOptimisticMessageFailed: failed });
  return (
    <>
      <output aria-label="Send phase">{h.messageFetcher.state}</output>
      <ChatInput
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
    </>
  );
}
let router: ReturnType<typeof createMemoryRouter> | undefined;
beforeEach(() => {
  createWorkspaceEventSourceMock();
  newPhoneNumber = "";
  failed.mockReset();
  toastMocks.error.mockReset();
  toastMocks.warning.mockReset();
});
afterEach(() => {
  cleanup();
  router?.dispose();
  vi.unstubAllGlobals();
});

test.each(["synchronous", "microtask"])(
  "real router handles an immediate %s failure and permits a second send",
  async (timing) => {
    let calls = 0;
    router = createMemoryRouter(
      [
        {
          path: "/",
          element: <Outlet context={{ workspace: { id: "ws1" } }} />,
          children: [
            {
              path: "workspaces/:id/chats/:contact_number",
              element: <Composer />,
              loader: () => loader,
              action: () => {
                const response = { error: `Failure ${++calls}` };
                return timing === "synchronous"
                  ? response
                  : Promise.resolve(response);
              },
            },
          ],
        },
      ],
      { initialEntries: ["/workspaces/ws1/chats/+15551234567"] },
    );
    render(<RouterProvider router={router} />);
    const field =
      await screen.findByPlaceholderText<HTMLTextAreaElement>(
        "Type your message",
      );
    const body = "a".repeat(340);
    fireEvent.change(field, { target: { value: body } });
    const form = field.closest("form");
    if (!form) throw new Error("Composer form is missing");
    fireEvent.submit(form);
    await waitFor(() => expect(failed).toHaveBeenCalledOnce());
    expect(field).toHaveValue(body);
    expect(screen.getByText("34/153")).toBeInTheDocument();
    expect(screen.getByText("≈ 6 credits")).toBeInTheDocument();
    fireEvent.submit(form);
    await waitFor(() => expect(failed).toHaveBeenCalledTimes(2));
    expect(calls).toBe(2);
    expect(field).toHaveValue(body);
    expect(toastMocks.error.mock.calls.map(([text]) => text)).toEqual([
      "Failure 1",
      "Failure 2",
    ]);
  },
);

test.each(["synchronous", "microtask"])(
  "real router handles an immediate %s success and permits a second send",
  async (timing) => {
    let calls = 0;
    router = createMemoryRouter(
      [
        {
          path: "/",
          element: <Outlet context={{ workspace: { id: "ws1" } }} />,
          children: [
            {
              path: "workspaces/:id/chats/:contact_number",
              element: <Composer />,
              loader: () => loader,
              action: () => {
                calls++;
                const response = { billing: { nextSendBlocked: true } };
                return timing === "synchronous"
                  ? response
                  : Promise.resolve(response);
              },
            },
          ],
        },
      ],
      { initialEntries: ["/workspaces/ws1/chats/+15551234567"] },
    );
    render(<RouterProvider router={router} />);
    const field =
      await screen.findByPlaceholderText<HTMLTextAreaElement>(
        "Type your message",
      );
    const form = field.closest("form");
    if (!form) throw new Error("Composer form is missing");
    fireEvent.change(field, { target: { value: "First draft" } });
    fireEvent.submit(form);
    await waitFor(() => expect(toastMocks.warning).toHaveBeenCalledOnce());
    expect(field).toHaveValue("");
    expect(screen.getByText("≈ 0 credits")).toBeInTheDocument();
    fireEvent.change(field, { target: { value: "Second draft" } });
    fireEvent.submit(form);
    await waitFor(() => expect(toastMocks.warning).toHaveBeenCalledTimes(2));
    expect(calls).toBe(2);
    expect(field).toHaveValue("");
    expect(failed).not.toHaveBeenCalled();
    expect(toastMocks.error).not.toHaveBeenCalled();
  },
);

test("real router releases a first-send redirect and permits a reply", async () => {
  newPhoneNumber = "+15551234567";
  let calls = 0;
  router = createMemoryRouter(
    [
      {
        path: "/",
        element: <Outlet context={{ workspace: { id: "ws1" } }} />,
        children: [
          {
            path: "workspaces/:id/chats/:contact_number?",
            element: <Composer />,
            loader: () => loader,
            action: () =>
              ++calls === 1
                ? redirect("/workspaces/ws1/chats/+15551234567")
                : { error: "Reply failed" },
          },
        ],
      },
    ],
    { initialEntries: ["/workspaces/ws1/chats"] },
  );
  render(<RouterProvider router={router} />);
  const field =
    await screen.findByPlaceholderText<HTMLTextAreaElement>(
      "Type your message",
    );
  const form = field.closest("form");
  if (!form) throw new Error("Composer form is missing");
  fireEvent.change(field, { target: { value: "First message" } });
  fireEvent.submit(form);
  await waitFor(() =>
    expect(router?.state.location.pathname).toBe(
      "/workspaces/ws1/chats/+15551234567",
    ),
  );
  expect(field).toHaveValue("");
  fireEvent.change(field, { target: { value: "Reply" } });
  fireEvent.submit(form);
  await waitFor(() => expect(failed).toHaveBeenCalledOnce());
  expect(calls).toBe(2);
  expect(field).toHaveValue("Reply");
  expect(toastMocks.error).toHaveBeenCalledExactlyOnceWith("Reply failed");
});
