import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { SaveBar } from "@/components/shared/SaveBar";

describe("SaveBar placement (#1128)", () => {
  test("a bottom bar sticks to the bottom and does not own the save shortcut", () => {
    const onSave = vi.fn();
    const { container } = render(<SaveBar isChanged onSave={onSave} placement="bottom" />);
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.getAttribute("data-placement")).toBe("bottom");
    expect(bar.className).toContain("bottom-0");
    expect(bar.className).not.toContain("top-0");
    fireEvent.keyDown(document, { key: "s", ctrlKey: true });
    expect(onSave).not.toHaveBeenCalled();
  });

  test("the top bar keeps the shortcut", () => {
    const onSave = vi.fn();
    render(<SaveBar isChanged onSave={onSave} />);
    fireEvent.keyDown(document, { key: "s", ctrlKey: true });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  test("both bars hide when nothing changed", () => {
    const { container } = render(
      <>
        <SaveBar isChanged={false} onSave={vi.fn()} />
        <SaveBar isChanged={false} onSave={vi.fn()} placement="bottom" />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
