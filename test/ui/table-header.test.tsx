import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";

describe("app/components/call-list/records/TableHeader.tsx", () => {
  test("renders no headers by default", async () => {
    const { TableHeader } = await import("@/components/call-list/records/TableHeader");
    const { container } = render(
      <table>
        <TableHeader />
      </table>,
    );
    expect(container.querySelectorAll("th")).toHaveLength(0);
  });

  test("renders hidden header cells for provided keys", async () => {
    const { TableHeader } = await import("@/components/call-list/records/TableHeader");
    const { container } = render(
      <table>
        <TableHeader keys={["First", "Second"]} />
      </table>,
    );
    const headers = Array.from(container.querySelectorAll("th"));
    expect(headers).toHaveLength(2);
    expect(headers[0].textContent).toBe("First");
    expect(headers[1].textContent).toBe("Second");
    expect(headers[0].hasAttribute("hidden")).toBe(true);
  });
});

