import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  test("renders children", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  // #1319: upstream shad-cc destructive variant hovers to a lightened
  // red while keeping near-white text — reads as low-contrast on the
  // "Leave Campaign" / "Delete" buttons the design team flagged. The
  // local wrapper flips text to black on hover so the button stays
  // legible.
  test("#1319: destructive variant carries `hover:text-black` for readable hover contrast", () => {
    render(<Button variant="destructive">Delete</Button>);
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn.className).toContain("hover:text-black");
  });

  test("#1319: non-destructive variants do NOT get the hover override", () => {
    render(
      <>
        <Button variant="default">Default</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="secondary">Secondary</Button>
      </>,
    );
    for (const name of ["Default", "Outline", "Ghost", "Secondary"]) {
      expect(screen.getByRole("button", { name }).className).not.toContain(
        "hover:text-black",
      );
    }
  });

  test("#1319: a caller-supplied hover:text-* still wins over the override", () => {
    render(
      <Button variant="destructive" className="hover:text-white">
        Delete
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Delete" });
    // tailwind-merge dedupes: the caller's `hover:text-white` wins,
    // dropping our default `hover:text-black` — this proves the
    // override is opt-outable without a variant fork.
    expect(btn.className).toContain("hover:text-white");
    expect(btn.className).not.toContain("hover:text-black");
  });
});

