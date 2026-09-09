import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { FormField, FormFieldControl } from "@/components/ui/form-field";
import { MicrophoneField } from "@/components/call/CallScreen.DeviceSettings";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

describe("shared field accessibility (#1748)", () => {
  test.each([
    ["input", <Input id="contact" key="input" />],
    ["textarea", <Textarea id="contact" key="textarea" />],
    ["select", <select id="contact" key="select"><option>Email</option></select>],
  ])("connects help and errors to a direct %s", (_name, control) => {
    render(
      <FormField htmlFor="contact" label="Contact" description="Use your work address." error="Enter a valid address.">
        {control}
      </FormField>,
    );
    const input = screen.getByLabelText("Contact");
    expect(input).toHaveAccessibleDescription("Use your work address. Enter a valid address.");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  test("explicit wrapping preserves custom help and makes a field error authoritative", () => {
    render(
      <>
        <p id="privacy">Only your team can see this.</p>
        <FormField htmlFor="email" label="Email" description="Use a work address." error="Check this address.">
          <FormFieldControl>
            <Input id="email" aria-describedby="privacy privacy" aria-invalid={false} />
          </FormFieldControl>
        </FormField>
      </>,
    );
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAccessibleDescription("Only your team can see this. Use a work address. Check this address.");
    expect(input.getAttribute("aria-describedby")?.split(/\s+/).filter((id) => id === "privacy")).toHaveLength(1);
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  test("clearing field feedback preserves the input, focus, value, ref, and custom description", () => {
    const ref = createRef<HTMLInputElement>();
    const onChange = vi.fn();
    function Field({ error, description }: { error?: string; description?: string }) {
      return <><p id="hint">Keep this address private.</p>
        <FormField htmlFor="email" label="Email" description={description} error={error}>
          <Input id="email" ref={ref} aria-describedby="hint" defaultValue="old@example.com" onChange={onChange} required />
        </FormField>
      </>;
    }
    const { rerender } = render(<Field description="Use a work address." error="Check this address." />);
    const input = screen.getByLabelText("Email");
    const oldErrorIds = input.getAttribute("aria-describedby")?.split(/\s+/).filter((id) => id !== "hint") ?? [];
    input.focus();
    fireEvent.change(input, { target: { value: "new@example.com" } });
    rerender(<Field />);
    expect(screen.getByLabelText("Email")).toBe(input);
    expect(ref.current).toBe(input);
    expect(input).toHaveFocus();
    expect(input).toHaveValue("new@example.com");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(input).toBeRequired();
    expect(input).toHaveAccessibleDescription("Keep this address private.");
    expect(input).not.toHaveAttribute("aria-invalid");
    for (const id of oldErrorIds) expect(document.getElementById(id)).toBeNull();
  });

  test("keeps control-owned validation when the field has no error", () => {
    render(<FormField htmlFor="email" label="Email"><Input id="email" aria-invalid="spelling" /></FormField>);
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "spelling");
  });

  test("does not attach the field feedback to a sibling action or a nested field", () => {
    render(
      <FormField htmlFor="email" label="Email" error="Check email.">
        <Input id="email" />
        <button id="lookup" type="button">Find contact</button>
        <FormField htmlFor="phone" label="Phone" description="Include the country code.">
          <Input id="phone" />
        </FormField>
      </FormField>,
    );
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription("Check email.");
    expect(screen.getByLabelText("Phone")).toHaveAccessibleDescription("Include the country code.");
    expect(screen.getByLabelText("Phone")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("button", { name: "Find contact" })).not.toHaveAttribute("aria-describedby");
  });

  test("supports an explicitly wrapped trigger inside a compound select", () => {
    render(
      <><p id="country-help">Choose where your team works.</p>
        <FormField htmlFor="country" label="Country" description="Used for number setup." error="Select a country.">
          <Select>
            <FormFieldControl>
              <SelectTrigger id="country" aria-describedby="country-help"><SelectValue placeholder="Choose a country" /></SelectTrigger>
            </FormFieldControl>
            <SelectContent><SelectItem value="CA">Canada</SelectItem></SelectContent>
          </Select>
        </FormField>
      </>,
    );
    const trigger = screen.getByRole("combobox", { name: "Country" });
    expect(trigger).toHaveAccessibleDescription("Choose where your team works. Used for number setup. Select a country.");
    expect(trigger).toHaveAttribute("aria-invalid", "true");
  });
  test("connects microphone-monitor guidance to the audio device trigger", () => {
    render(<MicrophoneField
      availableMicrophones={[]}
      selectedMicrophone={null}
      handleMicrophoneChange={vi.fn()}
      handleMuteMicrophone={vi.fn()}
      isMicrophoneMuted={false}
      isMicMonitoring
    />);
    expect(screen.getByRole("combobox", { name: /Microphone/ })).toHaveAccessibleDescription(
      "Speak — the meter reflects your input level.",
    );
  });

});
