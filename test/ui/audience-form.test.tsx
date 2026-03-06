import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@remix-run/react", () => ({
  Form: (props: any) => <form {...props} />,
}));

describe("app/components/audience/AudienceForm.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("renders with initial name and disables save when empty; submits via handleSaveAudience", async () => {
    const { AudienceForm } = await import("@/components/audience/AudienceForm");
    const handleSaveAudience = vi.fn(async () => {});

    const { unmount } = render(
      <AudienceForm
        audienceInfo={null}
        handleSaveAudience={handleSaveAudience}
        audience_id="a1"
        workspace_id="w1"
      />
    );

    const nameInput = screen.getByPlaceholderText("Audience Name") as HTMLInputElement;
    expect(nameInput.value).toBe("");
    expect(screen.getByRole("button", { name: "SAVE" })).toBeDisabled();

    fireEvent.change(nameInput, { target: { value: "My Audience" } });
    expect(screen.getByRole("button", { name: "SAVE" })).not.toBeDisabled();
    // cover value.length === 0 branch (does not clear error)
    fireEvent.change(nameInput, { target: { value: "" } });
    expect(screen.getByRole("button", { name: "SAVE" })).toBeDisabled();
    fireEvent.change(nameInput, { target: { value: "My Audience" } });

    fireEvent.submit(nameInput.closest("form") as HTMLFormElement);
    expect(handleSaveAudience).toHaveBeenCalled();

    // initial value from audienceInfo (fresh mount; component doesn't sync state on prop change)
    unmount();
    render(
      <AudienceForm
        audienceInfo={{ name: "Existing" } as any}
        handleSaveAudience={handleSaveAudience}
        audience_id="a1"
        workspace_id="w1"
      />
    );
    expect((screen.getByPlaceholderText("Audience Name") as HTMLInputElement).value).toBe("Existing");
  });
});

