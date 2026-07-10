import React, { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { makeContact, DataSmokeRouter, SmokeRouter } from "./_helpers/component-smoke";

vi.mock("@/hooks/chats/useChatThread", () => ({
  useChatThread: () => ({
    contact_number: "+1555",
    messages: [{ sid: "1", body: "Hi", date_created: new Date().toISOString(), direction: "inbound" }],
    messagesEndRef: createRef(),
    scrollContainerRef: createRef(),
    loadMoreSentinelRef: vi.fn(),
    hasMoreOlder: true,
    loadingOlder: false,
    optedOut: true,
  }),
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useLoaderData: () => ({
      contacts: [makeContact()],
      error: null,
      userRole: "admin",
      campaigns: [],
      workspace: { id: "w1", name: "WS" },
      pagination: {
        totalCount: 1,
        currentPage: 1,
        pageSize: 25,
        totalPages: 1,
      },
    }),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useFetcher: () => ({ submit: vi.fn(), state: "idle", data: null, Form: ({ children, ...p }: any) => <form {...p}>{children}</form> }),
    useNavigate: () => vi.fn(),
  };
});

describe("app/components/chats/ChatOptOutBanner.tsx", () => {
  test("null when not opted out; banner when opted out", async () => {
    const { ChatOptOutBanner } = await import("@/components/chats/ChatOptOutBanner");
    const { container, unmount } = render(<ChatOptOutBanner optedOut={false} />);
    expect(container.firstChild).toBeNull();
    unmount();
    render(<ChatOptOutBanner optedOut contactPhone="+1555" />);
    expect(screen.getByText(/This contact has opted out/i)).toBeInTheDocument();
    unmount();
    render(<ChatOptOutBanner optedOut />);
    expect(screen.getAllByText(/Do not send further/i)[0]).toBeInTheDocument();
  });
});

describe("app/components/sms-ui/ChatMessages.tsx", () => {
  test("renders a distinct failed/undelivered state with error_message", async () => {
    const ChatMessages = (await import("@/components/sms-ui/ChatMessages"))
      .default;
    render(
      <ChatMessages
        messages={[
          {
            sid: "SM-failed",
            status: "failed",
            direction: "outbound",
            body: "hello",
            date_created: new Date().toISOString(),
            error_message: "Landline or unreachable carrier",
          },
          {
            sid: "SM-ok",
            status: "delivered",
            direction: "outbound",
            body: "world",
            date_created: new Date().toISOString(),
          },
        ]}
        messagesEndRef={createRef()}
      />,
    );

    expect(screen.getByText("Not delivered")).toBeInTheDocument();
    expect(
      screen.getByText(/Landline or unreachable carrier/),
    ).toBeInTheDocument();
    const failedBubble = screen
      .getByText("hello")
      .closest("div[data-message-status]")
      ?.querySelector("div");
    expect(failedBubble?.className).toContain("border-destructive");

    const okItem = screen.getByText("world").closest("[data-message-status]");
    expect(okItem).toHaveAttribute("data-message-status", "delivered");
    expect(screen.queryByText(/Landline/)).not.toBeNull();
  });

  test("keeps data-message-status intact for both failed and normal messages", async () => {
    const ChatMessages = (await import("@/components/sms-ui/ChatMessages"))
      .default;
    render(
      <ChatMessages
        messages={[
          {
            sid: "SM-failed-2",
            status: "failed",
            direction: "inbound",
            body: "failed one",
            date_created: new Date().toISOString(),
          },
        ]}
        messagesEndRef={createRef()}
      />,
    );
    const item = screen
      .getByText("failed one")
      .closest("[data-message-status]");
    expect(item).toHaveAttribute("data-message-status", "failed");
    expect(item).toHaveAttribute("data-message-id", "SM-failed-2");
  });
});

describe("app/components/chats/ChatThreadView.tsx", () => {
  test("renders messages from hook", async () => {
    const { ChatThreadView } = await import("@/components/chats/ChatThreadView");
    render(
      <ChatThreadView
        client={{} as never}
        workspace={{ id: "w1", name: "WS", owner: null, users: [], created_at: "" } as never}
      />,
    );
    expect(screen.getByText("Hi")).toBeInTheDocument();
  });
});

describe("app/components/contact", () => {
  test("ContactDetails renders", async () => {
    const { default: ContactDetails } = await import("@/components/contact/ContactDetails");
    render(
      <ContactDetails contact={makeContact()} audiences={[]} userRole="admin" />,
    );
    expect(document.body.textContent).toMatch(/Contact|Edit|Save/i);
  });

  test("ContactForm renders", async () => {
    const { ContactForm } = await import("@/components/contact/ContactForm");
    render(
      <DataSmokeRouter>
        <ContactForm
          isNew
          newContact={makeContact()}
          handleInputChange={vi.fn()}
          handleSaveContact={vi.fn()}
          workspace_id="w1"
          audience_id={null}
        />
      </DataSmokeRouter>,
    );
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
  });
});

describe("app/components/contacts/ContactsPage.tsx", () => {
  test("renders contacts page shell", async () => {
    const ContactsPage = (await import("@/components/contacts/ContactsPage")).default;
    render(
      <SmokeRouter>
        <ContactsPage />
      </SmokeRouter>,
    );
    expect(document.body.textContent).toBeTruthy();
  });
});
