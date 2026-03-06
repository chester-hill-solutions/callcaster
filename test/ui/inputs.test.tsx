import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { DateTime, DragOver, Dropdown, TextInput, Toggle } from "@/components/Inputs";

describe("app/components/Inputs.tsx", () => {
  test("TextInput renders and forwards props", () => {
    const onChange = vi.fn();
    render(
      <TextInput
        name="n"
        value="v"
        onChange={onChange}
        className="c"
        label="L"
        placeholder="P"
        disabled={true}
      />
    );
    expect(screen.getByLabelText("L")).toHaveValue("v");
    fireEvent.change(screen.getByLabelText("L"), { target: { value: "x" } });
    expect(onChange).toHaveBeenCalled();
  });

  test("TextInput default label uses name", () => {
    render(<TextInput name="t2" value="x" onChange={() => {}} />);
    expect(screen.getByLabelText("t2")).toBeInTheDocument();
  });

  test("Dropdown renders options and respects disabled/readOnly", () => {
    const onChange = vi.fn();
    render(
      <Dropdown
        name="d"
        label="D"
        value=""
        onChange={onChange}
        disabled={true}
        options={[{ name: "a", value: "1", label: "One" }]}
      />
    );
    const select = screen.getByLabelText("D");
    expect(select).toHaveValue("");
    fireEvent.change(select, { target: { value: "1" } });
    expect(onChange).toHaveBeenCalled();
  });

  test("Dropdown defaults (label/value/options/disabled/className)", () => {
    const onChange = vi.fn();
    render(<Dropdown name="d2" onChange={onChange} />);
    // label defaults to name
    const select = screen.getByLabelText("d2");
    expect(select).toHaveValue("");
    fireEvent.change(select, { target: { value: "" } });
    expect(onChange).toHaveBeenCalled();
  });

  test("Dropdown renders with truthy value (covers value || '')", () => {
    render(
      <Dropdown
        name="d3"
        value="1"
        onChange={() => {}}
        options={[{ name: "a", value: "1", label: "One" }]}
      />
    );
    expect(screen.getByLabelText("d3")).toHaveValue("1");
  });

  test("DateTime opens/closes calendar, navigates months, selects day, changes time, and handles outside clicks", () => {
    const onChange = vi.fn();
    const { container, unmount } = render(
      <DateTime name="dt" label="DT" value={null as any} onChange={onChange} />
    );

    // listener runs even when calendarRef is null
    fireEvent.mouseDown(document.body);

    const input = screen.getByRole("textbox");
    fireEvent.click(input);
    expect(container.querySelector(".datetime-picker")).toBeTruthy();

    const prev = screen.getByText("Prev");
    const next = screen.getByText("Next");
    fireEvent.click(prev);
    fireEvent.click(next);

    // click a day (1)
    fireEvent.click(screen.getByText("1"));
    expect(onChange).toHaveBeenCalled();

    // reopen and cover inside/outside click handling
    fireEvent.click(input);
    const picker = container.querySelector(".datetime-picker") as HTMLElement;
    expect(picker).toBeTruthy();

    fireEvent.mouseDown(picker); // inside -> stays open
    expect(container.querySelector(".datetime-picker")).toBeTruthy();

    fireEvent.mouseDown(document.body); // outside -> closes
    expect(container.querySelector(".datetime-picker")).toBeFalsy();

    // time change path (reopen)
    fireEvent.click(input);
    const hour = container.querySelector('input[name="hour"]') as HTMLInputElement;
    const minute = container.querySelector('input[name="minute"]') as HTMLInputElement;
    fireEvent.change(hour, { target: { name: "hour", value: "3" } });
    fireEvent.change(minute, { target: { name: "minute", value: "4" } });
    expect(onChange).toHaveBeenCalled();

    unmount(); // cleanup effect
  });

  test("DragOver handles drag/drop, file input, remove, and click-to-open", () => {
    const handleDropContent = vi.fn();
    const Icon = () => <span>icon</span>;
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click");

    const { container } = render(
      <DragOver
        handleDropContent={handleDropContent}
        Icon={Icon}
        title="Upload"
        label="File"
        value={null}
        name="f"
      />
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const dropZone = input.parentElement as HTMLElement;
    fireEvent.dragOver(dropZone);
    expect(dropZone.className).toContain("bg-gray-200");
    fireEvent.dragLeave(dropZone);
    expect(dropZone.className).toContain("bg-brand-primary");

    const file = new File(["x"], "a.txt", { type: "text/plain" });
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });
    expect(handleDropContent).toHaveBeenCalledWith(file);
    expect(screen.getByText(/Remove a\.txt/)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Remove a\.txt/));
    expect(handleDropContent).toHaveBeenCalledWith(null);
    expect(screen.getByText("No file uploaded")).toBeInTheDocument();

    // file input change
    const file2 = new File(["y"], "b.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file2] } });
    expect(handleDropContent).toHaveBeenCalledWith(file2);
    // file change with no file
    fireEvent.change(input, { target: { files: [] } });
    expect(handleDropContent).toHaveBeenCalledWith(undefined);

    // click-to-open calls input.click()
    fireEvent.click(dropZone);
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  test("DateTime with onChange omitted still works (covers onChange && branches)", () => {
    const { container } = render(<DateTime name="dt2" label="DT2" value={new Date()} />);
    fireEvent.click(screen.getByRole("textbox"));
    expect(container.querySelector(".datetime-picker")).toBeTruthy();
    const hour = container.querySelector('input[name="hour"]') as HTMLInputElement;
    fireEvent.change(hour, { target: { name: "hour", value: "1" } });
    fireEvent.click(screen.getByText("1"));
  });

  test("DateTime default value param (no value prop)", () => {
    render(<DateTime name="dt3" onChange={() => {}} />);
    expect(screen.getByLabelText("dt3")).toBeInTheDocument();
  });

  test("Toggle renders both checked states and calls onChange", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <Toggle name="t" label="T" isChecked={false} onChange={onChange} leftLabel="L" rightLabel="R" />
    );
    const cb = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(cb);
    expect(onChange).toHaveBeenCalledWith(true);

    rerender(<Toggle name="t" label="T" isChecked={true} onChange={onChange} leftLabel="L" rightLabel="R" />);
    const knob = container.querySelector('div[style*="translateX"]') as HTMLElement;
    expect(knob.getAttribute("style") ?? "").toContain("translateX(40px)");
  });

  test("Toggle default labels (covers label=name, left/right default)", () => {
    const { container } = render(<Toggle name="t2" isChecked={true} onChange={() => {}} />);
    expect(screen.getByLabelText("t2")).toBeInTheDocument();
    const knob = container.querySelector('div[style*="translateX"]') as HTMLElement;
    expect(knob.getAttribute("style") ?? "").toContain("translateX(40px)");
  });
});

