import React, { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

afterEach(cleanup);

function Choice({ preventEscape = false }: { preventEscape?: boolean }) {
  const [value, setValue] = useState("computer");
  return (
    <>
      <input aria-label="Draft note" defaultValue="Keep my note" />
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger aria-label="Calling device">
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          onEscapeKeyDown={
            preventEscape ? (event) => event.preventDefault() : undefined
          }
        >
          <SelectItem value="computer">Computer Audio</SelectItem>
          <SelectItem value="phone">Verified phone</SelectItem>
        </SelectContent>
      </Select>
    </>
  );
}

function Fixture({
  kind,
  preventEscape = false,
}: {
  kind: "sheet" | "dialog";
  preventEscape?: boolean;
}) {
  return (
    <>
      <Button>Background action</Button>
      {kind === "sheet" ? (
        <Sheet>
          <SheetTrigger asChild>
            <Button>Open settings</Button>
          </SheetTrigger>
          <SheetContent>
            <SheetTitle>Settings</SheetTitle>
            <SheetBody>
              <Choice preventEscape={preventEscape} />
            </SheetBody>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog>
          <DialogTrigger asChild>
            <Button>Open settings</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Settings</DialogTitle>
            <Choice preventEscape={preventEscape} />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

describe.each(["sheet", "dialog"] as const)("Select inside %s", (kind) => {
  async function open() {
    const user = userEvent.setup();
    render(<Fixture kind={kind} />);
    await user.click(screen.getByRole("button", { name: "Open settings" }));
    await screen.findByRole("dialog", { name: "Settings" });
    return user;
  }

  test("selects a portalled option without closing the parent or losing a draft", async () => {
    const user = await open();
    await user.click(screen.getByRole("combobox", { name: "Calling device" }));
    const option = await screen.findByText("Verified phone");
    // React Aria's jsdom fallback observes this real outside mouse sequence.
    fireEvent.mouseDown(option, { button: 0 });
    fireEvent.mouseUp(option, { button: 0 });
    fireEvent.click(option);
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeVisible();
    expect(
      screen.getByRole("combobox", { name: "Calling device" }),
    ).toHaveTextContent("Verified phone");
    expect(screen.getByRole("textbox", { name: "Draft note" })).toHaveValue(
      "Keep my note",
    );
  });

  test("keeps dropdown options accessible while background controls remain hidden", async () => {
    const user = await open();
    await user.click(screen.getByRole("combobox", { name: "Calling device" }));
    await screen.findByRole("option", { name: "Verified phone" });
    expect(
      screen.queryByRole("button", { name: "Background action" }),
    ).toBeNull();
  });

  test("selects with the keyboard and returns focus to the dropdown trigger", async () => {
    const user = await open();
    const trigger = screen.getByRole("combobox", { name: "Calling device" });
    trigger.focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeVisible();
    expect(trigger).toHaveTextContent("Verified phone");
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  test("Escape closes the dropdown first, then the parent, and restores trigger focus", async () => {
    const user = await open();
    const trigger = screen.getByRole("combobox", { name: "Calling device" });
    await user.click(trigger);
    await screen.findByRole("listbox");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeVisible();
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull(),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Open settings" }),
      ).toHaveFocus(),
    );
  });

  test("dismisses normally with Escape when the dropdown is closed", async () => {
    const user = await open();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull(),
    );
  });

  test("honors a caller that prevents dropdown dismissal without closing the parent", async () => {
    const user = userEvent.setup();
    render(<Fixture kind={kind} preventEscape />);
    await user.click(screen.getByRole("button", { name: "Open settings" }));
    await user.click(screen.getByRole("combobox", { name: "Calling device" }));
    await screen.findByRole("listbox");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("listbox")).toBeVisible();
    // Radix hides its parent from the accessibility tree while the list is open.
    expect(
      screen.getByRole("dialog", { name: "Settings", hidden: true }),
    ).toBeVisible();
  });

  test("dismisses normally on an outside click when the dropdown is closed", async () => {
    await open();
    fireEvent.mouseDown(document.body, { button: 0 });
    fireEvent.mouseUp(document.body, { button: 0 });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull(),
    );
  });
});
