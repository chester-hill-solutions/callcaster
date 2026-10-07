import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import ContactDetails, {
  type ContactDetailsHandle,
} from "@/components/contact/ContactDetails";
import { saved, audiences } from "./_helpers/contact-editor";

vi.mock("@/lib/logger.client", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

function editor(contact = saved) {
  const ref = createRef<ContactDetailsHandle>();
  const changed = vi.fn();
  render(
    <ContactDetails
      ref={ref}
      contact={contact}
      audiences={audiences}
      onChangesChange={changed}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  return { ref, changed };
}
function json(ref: React.RefObject<ContactDetailsHandle | null>, key: string) {
  return JSON.parse(ref.current?.getFormValues()[key] ?? "null");
}

describe("contact editor complete draft (#2127)", () => {
  test("checking a visible list updates its control and Save payload without dropping hidden memberships", () => {
    const { ref, changed } = editor();
    fireEvent.click(screen.getByRole("checkbox", { name: "List 2" }));
    expect(screen.getByRole("checkbox", { name: "List 2" })).toBeChecked();
    expect(json(ref, "audience_ids")).toEqual([1, 99, 2]);
    expect(changed).toHaveBeenLastCalledWith(true);
  });
  test("unchecking a visible list removes only that membership", () => {
    const { ref } = editor();
    fireEvent.click(screen.getByRole("checkbox", { name: "List 1" }));
    expect(screen.getByRole("checkbox", { name: "List 1" })).not.toBeChecked();
    expect(json(ref, "audience_ids")).toEqual([99]);
  });
  test("editing one Other Data value preserves hidden keys and untouched JSON types", () => {
    const { ref } = editor();
    fireEvent.change(screen.getByRole("textbox", { name: "notes" }), {
      target: { value: "Updated" },
    });
    expect(screen.getByRole("textbox", { name: "notes" })).toHaveValue(
      "Updated",
    );
    expect(json(ref, "other_data")).toEqual([
      { notes: "Updated", hidden: { enabled: true, count: 3 } },
      { score: 7 },
      null,
    ]);
  });
  test("adding Other Data reaches Save while preserving existing rows", () => {
    const { ref } = editor();
    fireEvent.change(screen.getByRole("textbox", { name: "Field Name" }), {
      target: { value: "source" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Field Value" }), {
      target: { value: "Door" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Field" }));
    expect(screen.getByRole("textbox", { name: "source" })).toHaveValue("Door");
    expect(json(ref, "other_data")).toEqual([
      ...saved.other_data,
      { source: "Door" },
    ]);
  });
  test("removing a displayed field retains sibling keys and non-rendered rows", () => {
    const { ref } = editor();
    fireEvent.click(screen.getByRole("button", { name: "Remove notes field" }));
    expect(
      screen.queryByRole("textbox", { name: "notes" }),
    ).not.toBeInTheDocument();
    expect(json(ref, "other_data")).toEqual([
      { hidden: { enabled: true, count: 3 } },
      { score: 7 },
      null,
    ]);
  });
  test("removing a row's only field removes that row and leaves all others intact", () => {
    const { ref } = editor();
    fireEvent.click(screen.getByRole("button", { name: "Remove score field" }));
    expect(json(ref, "other_data")).toEqual([saved.other_data[0], null]);
    expect(
      screen.queryByRole("textbox", { name: "score" }),
    ).not.toBeInTheDocument();
  });
  test("Reset restores text, call lists, JSON and the dirty flag", () => {
    const { ref, changed } = editor();
    fireEvent.change(screen.getByPlaceholderText("Enter first name"), {
      target: { value: "Changed" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "List 1" }));
    fireEvent.change(screen.getByRole("textbox", { name: "notes" }), {
      target: { value: "Changed" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Field Name" }), {
      target: { value: "unfinished" },
    });
    act(() => ref.current?.reset());
    expect(screen.getByRole("textbox", { name: "Field Name" })).toHaveValue("");
    expect(ref.current?.getFormValues().firstname).toBe("Original");
    expect(screen.getByRole("checkbox", { name: "List 1" })).toBeChecked();
    expect(screen.getByRole("textbox", { name: "notes" })).toHaveValue("VIP");
    expect(json(ref, "audience_ids")).toEqual([1, 99]);
    expect(json(ref, "other_data")).toEqual(saved.other_data);
    expect(changed).toHaveBeenLastCalledWith(false);
  });
  test("a new contact can select a list and add Other Data before its first Save", () => {
    const ref = createRef<ContactDetailsHandle>();
    render(<ContactDetails ref={ref} audiences={audiences} startEditable />);
    fireEvent.click(screen.getByRole("checkbox", { name: "List 2" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Field Name" }), {
      target: { value: "source" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Field Value" }), {
      target: { value: "Signup" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Field" }));
    expect(json(ref, "audience_ids")).toEqual([2]);
    expect(json(ref, "other_data")).toEqual([{ source: "Signup" }]);
  });
  test("an unchanged typed JSON row is not converted to display strings", () => {
    const { ref } = editor();
    fireEvent.change(screen.getByPlaceholderText("Enter first name"), {
      target: { value: "Jane" },
    });
    expect(json(ref, "other_data")).toEqual(saved.other_data);
    expect(ref.current?.getFormValues().firstname).toBe("Jane");
  });
});
