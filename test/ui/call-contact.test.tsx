import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";

function makeContact(overrides: Partial<any> = {}) {
  return {
    firstname: "A",
    surname: "B",
    phone: "123",
    address: "1 Main St",
    ...overrides,
  } as any;
}

function makeHousehold(n: number) {
  return Array.from({ length: n }).map((_, i) => ({ contact: makeContact({ firstname: `H${i}` }) })) as any;
}

describe("app/components/call-list/records/participant/CallContact.tsx", () => {
  test("ungrouped + no household renders address cell and default styles", async () => {
    const QueueContact = (await import("@/components/call-list/records/participant/CallContact")).default;
    const { container } = render(
      <table>
        <tbody>
          <QueueContact contact={makeContact()} />
        </tbody>
      </table>,
    );

    const row = container.querySelector("tr") as HTMLTableRowElement;
    const cells = Array.from(container.querySelectorAll("td"));

    expect(row.style.borderTop).toMatch(/^(|unset)$/);
    expect(row.style.background).toMatch(/^(|unset)$/);
    expect(row.style.borderBottomLeftRadius).toMatch(/^(|unset)$/);

    expect(cells).toHaveLength(3);
    expect(cells[1].style.opacity).toBe("1");
    expect(cells[2].textContent).toContain("1 Main St");
    expect(cells[2].style.background).toMatch(/^(|unset)$/);
    expect(cells[2].style.color).toMatch(/^(|unset)$/);
  });

  test("grouped first-in-house can be selected/last and styles address cell", async () => {
    const QueueContact = (await import("@/components/call-list/records/participant/CallContact")).default;
    const { container } = render(
      <table>
        <tbody>
          <QueueContact
            contact={makeContact()}
            household={makeHousehold(2)}
            grouped={true}
            firstInHouse={true}
            selected={true}
            isLast={true}
          />
        </tbody>
      </table>,
    );

    const row = container.querySelector("tr") as HTMLTableRowElement;
    const cells = Array.from(container.querySelectorAll("td"));

    expect(row.style.borderTop).toMatch(/^2px solid/i);
    expect(row.style.background).toBe("rgb(241, 193, 193)");
    expect(row.style.borderBottomLeftRadius).toBe("18px");

    expect(cells).toHaveLength(3);
    expect(cells[1].style.opacity).toBe("1");
    expect(cells[2].style.background).toContain("secondary");
    expect(cells[2].style.color).toBe("rgb(51, 51, 51)");
    expect(cells[2].style.borderBottomRightRadius).toBe("18px");
    expect(cells[2].getAttribute("rowspan")).toBe("2");
  });

  test("grouped not-first-in-house dims phone and omits address cell", async () => {
    const QueueContact = (await import("@/components/call-list/records/participant/CallContact")).default;
    const { container } = render(
      <table>
        <tbody>
          <QueueContact
            contact={makeContact()}
            household={makeHousehold(3)}
            grouped={true}
            firstInHouse={false}
            selected={false}
            isLast={false}
          />
        </tbody>
      </table>,
    );

    const row = container.querySelector("tr") as HTMLTableRowElement;
    const cells = Array.from(container.querySelectorAll("td"));

    expect(row.style.borderTop).toContain("muted-foreground");
    expect(cells).toHaveLength(2);
    expect(cells[1].style.opacity).toBe("0.6");
  });
});

