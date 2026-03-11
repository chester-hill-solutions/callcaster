import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AudienceContactRow } from "@/components/AudienceContactRow";

const mocks = vi.hoisted(() => {
  return { logger: { error: vi.fn() } };
});

vi.mock("@/lib/logger.client", () => ({ logger: mocks.logger }));

function renderRow(overrides: Partial<any> = {}) {
  const contact = {
    id: 1,
    external_id: "",
    firstname: "A",
    surname: "B",
    phone: "",
    email: "",
    address: "",
    city: "",
    created_at: null,
    other_data: [{ foo: "bar" }, "nope", null],
    ...overrides,
  };

  const onSelect = vi.fn();
  const onRemove = vi.fn();

  render(
    <MemoryRouter>
      <AudienceContactRow
        contact={contact}
        audience_id="a1"
        otherDataHeaders={["foo", "missing"]}
        isSelected={false}
        onSelect={onSelect}
        onRemove={onRemove}
      />
    </MemoryRouter>
  );

  return { onSelect, onRemove };
}

describe("AudienceContactRow", () => {
  beforeEach(() => {
    mocks.logger.error.mockReset();
  });

  test("renders basic fields, other_data values, and wires checkbox/remove", () => {
    const { onSelect, onRemove } = renderRow();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(onSelect).toHaveBeenCalledWith(1, true);

    // other_data foo shows "bar", missing shows "-"
    expect(screen.getByText("bar")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button")[0]!);
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  test("covers default isSelected and name fallback '-'", () => {
    const contact = {
      id: 2,
      external_id: null,
      firstname: "",
      surname: "",
      phone: null,
      email: null,
      address: null,
      city: null,
      created_at: null,
      other_data: [],
    } as any;
    const onSelect = vi.fn();
    const onRemove = vi.fn();

    render(
      <MemoryRouter>
        <AudienceContactRow
          contact={contact}
          audience_id="a1"
          otherDataHeaders={[]}
          isSelected={undefined}
          onSelect={onSelect}
          onRemove={onRemove}
        />
      </MemoryRouter>
    );

    const nameDiv = screen.getByText("Name:").parentElement;
    const nameValue = nameDiv?.querySelector("span.ml-2");
    expect(nameValue?.textContent).toBe("-");
  });

  test("covers other_data value null branch and unselect", () => {
    const onSelect = vi.fn();
    const onRemove = vi.fn();
    const contact = {
      id: 3,
      external_id: "x",
      firstname: "A",
      surname: "B",
      phone: "p",
      email: "e",
      address: "a",
      city: "c",
      created_at: null,
      other_data: [{ foo: null }],
    } as any;

    render(
      <MemoryRouter>
        <AudienceContactRow
          contact={contact}
          audience_id="a1"
          otherDataHeaders={["foo"]}
          isSelected={true}
          onSelect={onSelect}
          onRemove={onRemove}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("checkbox"));
    expect(onSelect).toHaveBeenCalledWith(3, false);

    const fooDiv = screen.getByText("foo:").parentElement;
    const fooValue = fooDiv?.querySelector("span.ml-2");
    expect(fooValue?.textContent).toBe("-");
  });

  test("formats created_at when valid; invalid date returns empty strings", () => {
    const dateSpy = vi
      .spyOn(Date.prototype, "toLocaleDateString")
      .mockReturnValue("D");
    const timeSpy = vi
      .spyOn(Date.prototype, "toLocaleTimeString")
      .mockReturnValue("T");

    renderRow({ created_at: "not-a-date" });
    expect(screen.getByText("Created:")).toBeInTheDocument();
    const createdDiv1 = screen.getByText("Created:").parentElement;
    const createdValue1 = createdDiv1?.querySelector("span.ml-2");
    expect(createdValue1?.textContent ?? "").not.toContain("D");
    expect(createdValue1?.textContent ?? "").not.toContain("T");

    renderRow({ created_at: new Date("2020-01-02T03:04:05.000Z").toISOString() });
    const createdDiv2 = screen.getAllByText("Created:")[1]!.parentElement;
    const createdValue2 = createdDiv2?.querySelector("span.ml-2");
    expect(createdValue2?.textContent ?? "").toContain("D");
    expect(createdValue2?.textContent ?? "").toContain("T");

    dateSpy.mockRestore();
    timeSpy.mockRestore();
  });

  test("formatDate/formatTime catch logs and returns empty strings", () => {
    const dateSpy = vi
      .spyOn(Date.prototype, "toLocaleDateString")
      .mockImplementation(() => {
        throw new Error("d");
      });
    const timeSpy = vi
      .spyOn(Date.prototype, "toLocaleTimeString")
      .mockImplementation(() => {
        throw new Error("t");
      });

    renderRow({ created_at: new Date("2020-01-02T03:04:05.000Z").toISOString() });
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Error formatting date:",
      expect.anything()
    );
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Error formatting time:",
      expect.anything()
    );

    dateSpy.mockRestore();
    timeSpy.mockRestore();
  });

  test("getOtherDataValue catch logs and returns '-' when other_data is broken", () => {
    renderRow({ other_data: null });
    // missing header falls back to '-' (rendered via `|| '-'`)
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Error extracting other_data value:",
      expect.anything()
    );
  });
});

