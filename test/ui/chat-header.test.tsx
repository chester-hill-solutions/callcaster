import React, { createRef } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { makeContact } from "./_helpers/component-smoke";

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: toastMocks.success, error: toastMocks.error },
}));

// The Radix DropdownMenu primitives use portals/pointer events that jsdom
// doesn't model well; the rest of this codebase's tests (e.g.
// test/ui/audience-table.test.tsx) stub the primitives down to plain
// elements so item interactions can be exercised directly.
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect, disabled }: any) => (
    <div
      role="menuitem"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => !disabled && onSelect?.()}
      onKeyDown={(event: React.KeyboardEvent) => {
        if (!disabled && (event.key === "Enter" || event.key === " ")) {
          onSelect?.();
        }
      }}
    >
      {children}
    </div>
  ),
}));

async function renderChatHeader(props: {
  outlet: boolean;
  contact: any;
  contacts: any[];
  potentialContacts: any[];
  contactNumber: string;
  loaderData: Record<string, unknown>;
  actionMock: ReturnType<typeof vi.fn>;
}) {
  const ChatHeader = (await import("@/components/sms-ui/ChatHeader")).default;

  const router = createMemoryRouter(
    [
      {
        path: "/workspaces/:id/chats/:contact_number",
        loader: () => props.loaderData,
        action: props.actionMock,
        element: (
          <ChatHeader
            contact={props.contact}
            outlet={props.outlet}
            contacts={props.contacts}
            potentialContacts={props.potentialContacts}
            contactNumber={props.contactNumber}
            handlePhoneChange={vi.fn()}
            isValid
            toggleContactMenu={vi.fn()}
            isContactMenuOpen={false}
            handleContactSelect={vi.fn()}
            dropdownRef={createRef()}
            existingConversation={null}
            handleExistingConversationClick={vi.fn()}
            setDialog={vi.fn()}
          />
        ),
      },
      {
        path: "/api/contacts",
        loader: () => ({ contacts: [] }),
      },
    ],
    { initialEntries: [`/workspaces/w1/chats/${props.contactNumber}`] },
  );

  const utils = render(<RouterProvider router={router} />);
  return { ...utils, router };
}

describe("app/components/sms-ui/ChatHeader.tsx", () => {
  afterEach(() => {
    toastMocks.success.mockReset();
    toastMocks.error.mockReset();
  });

  test("shows the multi-number banner when the matched route reports multipleNumbersUsed", async () => {
    await renderChatHeader({
      outlet: true,
      contact: makeContact(),
      contacts: [],
      potentialContacts: [],
      contactNumber: "+15551234567",
      loaderData: { multipleNumbersUsed: true },
      actionMock: vi.fn(),
    });

    expect(
      await screen.findByText(/This conversation has used multiple of your numbers/i),
    ).toBeInTheDocument();
  });

  test("does not show the banner when multipleNumbersUsed is false", async () => {
    await renderChatHeader({
      outlet: true,
      contact: makeContact(),
      contacts: [],
      potentialContacts: [],
      contactNumber: "+15551234567",
      loaderData: { multipleNumbersUsed: false },
      actionMock: vi.fn(),
    });

    // Wait for the router to finish its initial data load before asserting
    // absence, otherwise the assertion would trivially pass on an empty DOM.
    await screen.findByText(/Chat with/i);
    expect(
      screen.queryByText(/This conversation has used multiple of your numbers/i),
    ).not.toBeInTheDocument();
  });

  test("shows a Landline badge next to the name when the resolved contact is a landline", async () => {
    await renderChatHeader({
      outlet: true,
      contact: makeContact({ line_type: "landline" }),
      contacts: [],
      potentialContacts: [],
      contactNumber: "+15551234567",
      loaderData: { multipleNumbersUsed: false },
      actionMock: vi.fn(),
    });

    expect(await screen.findByText("Landline")).toBeInTheDocument();
  });

  test("does not show the Landline badge for a mobile contact", async () => {
    await renderChatHeader({
      outlet: true,
      contact: makeContact({ line_type: "mobile" }),
      contacts: [],
      potentialContacts: [],
      contactNumber: "+15551234567",
      loaderData: { multipleNumbersUsed: false },
      actionMock: vi.fn(),
    });

    await screen.findByText(/Chat with/i);
    expect(screen.queryByText("Landline")).not.toBeInTheDocument();
  });

  test("offers an assign-to-contact affordance when no unique contact is resolved", async () => {
    await renderChatHeader({
      outlet: true,
      contact: null,
      contacts: [makeContact({ id: 1, firstname: "Ada" })],
      potentialContacts: [makeContact({ id: 2, firstname: "Grace" })],
      contactNumber: "+15551234567",
      loaderData: { multipleNumbersUsed: false },
      actionMock: vi.fn(),
    });

    expect(await screen.findByText("Assign Contact")).toBeInTheDocument();
    expect(screen.getByText("Find contact")).toBeInTheDocument();
    expect(screen.getByText(/Ada/)).toBeInTheDocument();
    expect(screen.getByText(/Grace/)).toBeInTheDocument();
  });

  test("selecting a candidate contact links it and shows a success toast", async () => {
    const actionMock = vi.fn(async () => ({ linkedCount: 2, contactId: 1 }));
    const user = userEvent.setup();

    await renderChatHeader({
      outlet: true,
      contact: null,
      contacts: [makeContact({ id: 1, firstname: "Ada" })],
      potentialContacts: [],
      contactNumber: "+15551234567",
      loaderData: { multipleNumbersUsed: false },
      actionMock,
    });

    await user.click(await screen.findByText(/Ada/));

    await waitFor(() => expect(actionMock).toHaveBeenCalled());
    const requestArg = actionMock.mock.calls[0]?.[0]?.request as Request;
    const formData = await requestArg.formData();
    expect(formData.get("intent")).toBe("link_contact");
    expect(formData.get("contact_id")).toBe("1");

    await waitFor(() =>
      expect(toastMocks.success).toHaveBeenCalledWith(
        expect.stringContaining("Linked — 2 earlier messages attached"),
      ),
    );
  });
});
