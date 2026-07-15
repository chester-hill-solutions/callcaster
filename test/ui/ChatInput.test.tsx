import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import ChatInput from "@/components/sms-ui/ChatInput";
import type { Contact } from "@/lib/types";

function makeMessageFetcher(overrides: Partial<{ state: string }> = {}) {
  return {
    state: overrides.state ?? "idle",
    data: undefined,
    Form: "form",
  } as unknown as ReturnType<typeof import("react-router").useFetcher>;
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    workspace: { id: "w1", name: "W", owner: null, users: null, created_at: "" },
    workspaceNumbers: [{ id: "1", phone_number: "+15550000000" }],
    initialFrom: "+15550000000",
    handleSubmit: vi.fn((e: React.FormEvent) => e.preventDefault()),
    handleImageSelect: vi.fn(),
    handleImageRemove: vi.fn(),
    selectedImages: [],
    selectedContact: null,
    messageFetcher: makeMessageFetcher(),
    phoneNumber: "+15551234567",
    isValid: true,
    ...overrides,
  } as React.ComponentProps<typeof ChatInput>;
}

describe("ChatInput From sender selection", () => {
  test("disables Send and explains when no sending numbers are available", () => {
    render(
      <ChatInput
        {...baseProps({
          workspaceNumbers: [],
          initialFrom: "",
        })}
      />,
    );
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(
      screen.getByRole("option", { name: /no sending numbers available/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/workspace sending number is required/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send message/i })).toBeDisabled();
  });

  test("recovers from an invalid initialFrom by selecting the first available number", () => {
    render(
      <ChatInput
        {...baseProps({
          workspaceNumbers: [
            { id: "1", phone_number: "+15550000000", friendly_name: "Main" },
            { id: "2", phone_number: "+15551111111" },
          ],
          initialFrom: "+15559999999",
        })}
      />,
    );
    expect(screen.getByRole("combobox")).toHaveValue("+15550000000");
    expect(screen.getByRole("button", { name: /send message/i })).toBeEnabled();
  });

  test("updates the selected From value when the user changes options", async () => {
    const user = userEvent.setup();
    render(
      <ChatInput
        {...baseProps({
          workspaceNumbers: [
            { id: "1", phone_number: "+15550000000", friendly_name: "Main" },
            { id: "2", phone_number: "+15551111111", friendly_name: "Alt" },
          ],
          initialFrom: "+15550000000",
        })}
      />,
    );

    await user.selectOptions(screen.getByRole("combobox"), "+15551111111");
    expect(screen.getByRole("combobox")).toHaveValue("+15551111111");
  });
});

describe("ChatInput opt-out and send-later", () => {
  test("enables Send for a normal contact", () => {
    render(<ChatInput {...baseProps()} />);
    expect(screen.getByRole("button", { name: /send message/i })).toBeEnabled();
    expect(screen.queryByText(/opted out/i)).not.toBeInTheDocument();
  });

  test("disables Send and shows an explanation when the selected contact opted out", () => {
    const optedOutContact = { id: 9, opt_out: true } as unknown as Contact;
    render(<ChatInput {...baseProps({ selectedContact: optedOutContact })} />);
    expect(screen.getByRole("button", { name: /send message/i })).toBeDisabled();
    expect(screen.getByText(/this contact has opted out/i)).toBeInTheDocument();
  });

  test("reveals a datetime picker when Send later is toggled and keeps Send disabled until a time is set", async () => {
    const user = userEvent.setup();
    render(<ChatInput {...baseProps()} />);
    expect(screen.queryByLabelText(/send at/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /send later/i }));

    const sendAtInput = screen.getByLabelText(/send at/i);
    expect(sendAtInput).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send message/i })).toBeDisabled();
  });
});

describe("ChatInput segment counter and credit estimate", () => {
  test("shows 0 credits and a GSM-7 counter before anything is typed", () => {
    render(<ChatInput {...baseProps()} />);
    expect(screen.getByText("0/160")).toBeInTheDocument();
    expect(screen.getByText("1 segment")).toBeInTheDocument();
    expect(screen.getByText("(GSM-7)")).toBeInTheDocument();
    expect(screen.getByText("≈ 0 credits")).toBeInTheDocument();
  });

  test("updates the segment counter and credit estimate as the body is typed", () => {
    render(<ChatInput {...baseProps()} />);

    const textarea = screen.getByPlaceholderText(/type your message/i);
    fireEvent.change(textarea, { target: { value: "a".repeat(161) } });

    expect(screen.getByText("8/153")).toBeInTheDocument();
    expect(screen.getByText("2 segments")).toBeInTheDocument();
    expect(screen.getByText("≈ 2 credits")).toBeInTheDocument();
  });

  test("switches to UCS-2 and doubles the unit cost for a single emoji", async () => {
    const user = userEvent.setup();
    render(<ChatInput {...baseProps()} />);

    const textarea = screen.getByPlaceholderText(/type your message/i);
    await user.type(textarea, "🔥");

    // A single astral-plane emoji is a UTF-16 surrogate pair: 2 units, not 1.
    expect(screen.getByText("2/70")).toBeInTheDocument();
    expect(screen.getByText("(UCS-2)")).toBeInTheDocument();
    expect(screen.getByText("≈ 1 credit")).toBeInTheDocument();
  });

  test("flips the credit estimate to the flat MMS rate the instant media is attached, independent of body length", () => {
    render(<ChatInput {...baseProps({ selectedImages: ["https://cdn.example/a.png"] })} />);

    const textarea = screen.getByPlaceholderText(/type your message/i);
    fireEvent.change(textarea, { target: { value: "a".repeat(400) } });

    // Still 3 text segments' worth of characters typed...
    expect(screen.getByText("3 segments")).toBeInTheDocument();
    // ...but the credit estimate is the flat MMS rate (2), not 3x per-segment.
    expect(screen.getByText("≈ 2 credits")).toBeInTheDocument();
  });
});
