import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { scripts } from "@/lib/call-script-service";
import { ScriptEditorShell } from "@/components/campaign/settings/script/ScriptEditorShell";
import { ScriptValidationDetails } from "@/components/campaign/settings/script/ScriptValidationDetails";

function document(next = "end") {
  return scripts.migrateFromCallcasterFlow({
    startPageId: "menu", pages: { menu: { title: "Menu", blocks: ["greeting"] } },
    blocks: { greeting: { type: "synthetic", audioFile: "Hello", options: [{ value: "1", label: "Continue", next }],
      noInput: { action: "replay", maxReplays: 2 }, gatherTimeoutSeconds: 7, customValue: "Retain" } },
  });
}

describe("inbound script validation details", () => {
  test.each(["queue:7", "forward:+15555550123", "voicemail:fixture@example.test"])(
    "shows and retains the stored terminal target %s during another edit", (target) => {
      const onChange = vi.fn();
      render(<ScriptEditorShell document={document(target)} onChange={onChange} audioFlow inboundFlow />);
      expect(screen.getByLabelText("Then go to")).toHaveTextContent(target);
      fireEvent.change(screen.getByLabelText("Answer label"), { target: { value: "New label" } });
      const wire = scripts.serializeToCallcasterFlow(onChange.mock.calls.at(-1)?.[0]);
      expect(wire.blocks.greeting.options).toMatchObject([{ next: target, label: "New label" }]);
      expect(screen.getByRole("status")).toHaveTextContent("no issues");
    },
  );

  test("an inbound step picker saves a page-qualified route", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const onChange = vi.fn();
    const doc = document();
    doc.pages.menu.blockIds.push("goodbye");
    doc.blocks.goodbye = { id: "goodbye", type: "instruction", title: "Goodbye", body: "Goodbye" };
    render(<ScriptEditorShell document={doc} onChange={onChange} audioFlow inboundFlow />);
    await userEvent.click(screen.getByLabelText("Then go to"));
    await userEvent.click(await screen.findByRole("option", { name: "Menu — Goodbye" }));
    const wire = scripts.serializeToCallcasterFlow(onChange.mock.calls.at(-1)?.[0]);
    expect(wire.blocks.greeting.options).toMatchObject([{ next: "menu:goodbye" }]);
    expect(screen.getByRole("status")).toHaveTextContent("no issues");
  });

  test("keeps no-input edits in the saved wire data and retains other extras", () => {
    const onChange = vi.fn();
    render(<ScriptEditorShell document={document()} onChange={onChange} audioFlow inboundFlow />);
    expect(screen.getByLabelText("Wait (seconds)")).toHaveValue(7);
    expect(screen.getByLabelText("On no input")).toHaveTextContent("Replay these instructions");
    fireEvent.change(screen.getByLabelText("Max replays"), { target: { value: "4" } });
    const wire = scripts.serializeToCallcasterFlow(onChange.mock.calls.at(-1)?.[0]);
    expect(wire.blocks.greeting).toMatchObject({ noInput: { action: "replay", maxReplays: 4 },
      gatherTimeoutSeconds: 7, customValue: "Retain" });
  });

  test("keeps the same validation action while details update and clear", async () => {
    const { rerender } = render(<ScriptValidationDetails errors={[]} inbound />);
    const action = screen.getByRole("button", { name: "Script validation" });
    rerender(<ScriptValidationDetails errors={["Choose a valid target."]} inbound />);
    expect(screen.getByRole("button", { name: "Script validation" })).toBe(action);
    fireEvent.click(action);
    expect(await screen.findByRole("dialog", { name: "Script validation" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a valid target.");
    rerender(<ScriptValidationDetails errors={["Choose a valid target.", "Review a second target."]} inbound />);
    expect(screen.getByRole("alert")).toHaveTextContent("Review a second target.");
    rerender(<ScriptValidationDetails errors={[]} inbound />);
    expect(screen.getByText("No script issues")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Return to editor" }));
    expect(screen.queryByRole("dialog", { name: "Script validation" })).not.toBeInTheDocument();
  });

  test("invalid inbound targets produce readable persistent details", async () => {
    render(<ScriptEditorShell document={document("forward:+0123")} onChange={vi.fn()} audioFlow inboundFlow />);
    expect(screen.getByRole("status")).toHaveTextContent("1 issues");
    fireEvent.click(screen.getByRole("button", { name: "Script validation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent('invalid forward target "forward:+0123"');
    expect(screen.getByText(/keep an invalid menu as a draft/)).toBeInTheDocument();
  });
});
