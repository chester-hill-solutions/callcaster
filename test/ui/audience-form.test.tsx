import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("react-router", () => ({
  Form: (props: any) => <form {...props} />,
}));

describe("app/components/audience/AudienceForm.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("renders controlled name, disables save when empty, and submits via handleSaveAudience", async () => {
    const { AudienceForm } = await import("@/components/audience/AudienceForm");
    const handleSaveAudience = vi.fn(async () => {});
    const onNameChange = vi.fn();

    const { rerender } = render(
      <AudienceForm
        name=""
        onNameChange={onNameChange}
        handleSaveAudience={handleSaveAudience}
        audience_id="a1"
        workspace_id="w1"
      />,
    );

    const nameInput = screen.getByPlaceholderText("Audience Name") as HTMLInputElement;
    expect(nameInput.value).toBe("");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(nameInput, { target: { value: "My Audience" } });
    expect(onNameChange).toHaveBeenCalledWith("My Audience");

    rerender(
      <AudienceForm
        name="My Audience"
        onNameChange={onNameChange}
        handleSaveAudience={handleSaveAudience}
        audience_id="a1"
        workspace_id="w1"
      />,
    );
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();

    fireEvent.submit(nameInput.closest("form") as HTMLFormElement);
    expect(handleSaveAudience).toHaveBeenCalled();

    rerender(
      <AudienceForm
        name="Existing"
        onNameChange={onNameChange}
        handleSaveAudience={handleSaveAudience}
        audience_id="a1"
        workspace_id="w1"
      />,
    );
    expect((screen.getByPlaceholderText("Audience Name") as HTMLInputElement).value).toBe(
      "Existing",
    );
  });
});
