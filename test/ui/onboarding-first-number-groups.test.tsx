import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { FirstNumberActionGroup } from "@/routes/workspaces+/$id/onboarding/OnboardingFirstNumberStep";

describe("FirstNumberActionGroup (#1113)", () => {
  test("is an accessible group named by an in-flow heading, not a legend", () => {
    render(
      <>
        <FirstNumberActionGroup title="Rent a Canadian number">
          <button type="button">Search numbers</button>
        </FirstNumberActionGroup>
        <FirstNumberActionGroup title="Verify your own number">
          <button type="button">Verify</button>
        </FirstNumberActionGroup>
      </>,
    );
    const rent = screen.getByRole("group", { name: "Rent a Canadian number" });
    const verify = screen.getByRole("group", { name: "Verify your own number" });
    expect(rent).toContainElement(screen.getByRole("button", { name: "Search numbers" }));
    expect(verify).toContainElement(screen.getByRole("button", { name: "Verify" }));
    // The title is a normal heading inside the box: nothing straddles or clips it.
    expect(screen.getByRole("heading", { name: "Rent a Canadian number" })).toBeInTheDocument();
    expect(document.querySelector("fieldset")).toBeNull();
    expect(document.querySelector("legend")).toBeNull();
    expect(rent.className).not.toContain("overflow-hidden");
  });
});
