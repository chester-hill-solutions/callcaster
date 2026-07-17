import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import ContactDetails from "@/components/contact/ContactDetails";
import type { ContactDetailsHandle } from "@/components/contact/ContactDetails";

const mocks = vi.hoisted(() => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/logger.client", () => ({ logger: mocks.logger }));

/**
 * Guards the P0 data-loss fix: the route's header Save button reads the
 * currently-typed field values off this ref (see
 * app/routes/workspaces+/$id/contacts/$contactId.route.tsx handleSave). If
 * ContactDetails goes back to a controlled input tied only to the read-only
 * `contact` prop (never storing keystrokes), getFormValues() would return
 * the original/blank values and Save would silently submit nothing — the
 * exact bug this test would catch.
 */
describe("ContactDetails form values", () => {
  test("new contact starts editable and captures typed values via the imperative handle", () => {
    const ref = createRef<ContactDetailsHandle>();
    render(
      <ContactDetails
        ref={ref}
        contact={undefined}
        audiences={[]}
        startEditable
      />,
    );

    // No Edit gate for a brand-new contact — fields are editable immediately.
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();

    const firstName = screen.getByPlaceholderText("Enter first name");
    expect(firstName).not.toBeDisabled();

    fireEvent.change(firstName, { target: { value: "Jane" } });
    fireEvent.change(screen.getByPlaceholderText("Enter last name"), {
      target: { value: "Doe" },
    });

    expect(ref.current?.getFormValues()).toMatchObject({
      firstname: "Jane",
      surname: "Doe",
    });
  });

  test("existing contact stays gated behind Edit, and reset restores saved values", () => {
    const ref = createRef<ContactDetailsHandle>();
    const onChangesChange = vi.fn();
    render(
      <ContactDetails
        ref={ref}
        contact={{ id: 5, firstname: "Original", surname: "Name" } as any}
        audiences={[]}
        onChangesChange={onChangesChange}
      />,
    );

    const firstNameBefore = screen.getByPlaceholderText(
      "Enter first name",
    ) as HTMLInputElement;
    expect(firstNameBefore).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));

    const firstName = screen.getByPlaceholderText(
      "Enter first name",
    ) as HTMLInputElement;
    expect(firstName).not.toBeDisabled();

    fireEvent.change(firstName, { target: { value: "Changed" } });
    expect(ref.current?.getFormValues()).toMatchObject({ firstname: "Changed" });
    expect(onChangesChange).toHaveBeenCalledWith(true);

    act(() => {
      ref.current?.reset();
    });
    expect(ref.current?.getFormValues()).toMatchObject({ firstname: "Original" });
  });

  test("other-data remove actions have accessible names in edit mode", () => {
    render(
      <ContactDetails
        contact={
          {
            id: 5,
            firstname: "Original",
            surname: "Name",
            other_data: JSON.stringify([{ notes: "VIP" }]),
          } as any
        }
        audiences={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(
      screen.getByRole("button", { name: "Remove notes field" }),
    ).toBeInTheDocument();
  });
});
