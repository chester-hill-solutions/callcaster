import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  test("renders children", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });
});

