import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/components/call-list/records/participant/Result.IconMap", () => {
  const A = (props: any) => <span data-testid="icon-A">A{props?.size ? `:${props.size}` : ""}</span>;
  const B = (props: any) => <span data-testid="icon-B">B{props?.size ? `:${props.size}` : ""}</span>;
  return { iconMapping: { A, B } };
});

describe("app/components/CampaignSettings.Script.QuestionBlock.Option.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("covers remove, content change, next-step changes, and icon picker behavior for radio blocks", async () => {
    const mod = await import("@/components/CampaignSettings.Script.QuestionBlock.Option");
    const handleRemoveOption = vi.fn();
    const handleChange = vi.fn();
    const handleIconChange = vi.fn();
    const addNewBlock = vi.fn(async () => "blk_new");
    const handleNextChange = vi.fn();

    const scriptData = {
      pages: { p1: { title: "Page 1", blocks: ["b1"] } },
      blocks: { b1: { title: "", id: "b1" }, blk_new: { title: "New", id: "blk_new" } }, // cover title||id fallback
    };

    const option = { value: "1", content: "Yes", next: "end", Icon: "A" };

    const { container, unmount } = render(
      <mod.default
        block={{ id: "blk1", type: "radio" } as any}
        option={option as any}
        handleRemoveOption={handleRemoveOption}
        index={0}
        handleChange={handleChange}
        handleIconChange={handleIconChange}
        scriptData={scriptData as any}
        addNewBlock={addNewBlock}
        handleNextChange={handleNextChange}
      />
    );

    // remove
    fireEvent.click(container.querySelector("button") as HTMLButtonElement);
    expect(handleRemoveOption).toHaveBeenCalledWith(option);

    // content change
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "New" } });
    expect(handleChange).toHaveBeenCalled();

    // next-step changes (page_ / end / add_new_block)
    const select = container.querySelector("select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "page_p1" } });
    expect(handleNextChange).toHaveBeenCalledWith(0, "page_p1");

    fireEvent.change(select, { target: { value: "end" } });
    expect(handleNextChange).toHaveBeenCalledWith(0, "end");

    fireEvent.change(select, { target: { value: "add_new_block" } });
    expect(addNewBlock).toHaveBeenCalled();

    // icon picker toggles and closes on outside click
    const iconToggle = container.querySelectorAll("button")[1] as HTMLButtonElement;
    fireEvent.click(iconToggle);
    expect(screen.getAllByTestId("icon-A").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("button").length).toBeGreaterThan(3); // includes icon grid buttons

    const iconContainer = container.querySelector(".shadow-lg") as HTMLElement;
    fireEvent.mouseDown(iconContainer); // inside -> stays open
    expect(container.querySelector(".shadow-lg")).toBeTruthy();

    // click icon in grid
    const iconBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("B")) as HTMLButtonElement;
    fireEvent.click(iconBtn);
    expect(handleIconChange).toHaveBeenCalledWith({ index: 0, iconName: "B" });
    expect(container.querySelector(".shadow-lg")).toBeFalsy();

    // reopen then outside click closes
    fireEvent.click(iconToggle);
    expect(container.querySelector(".shadow-lg")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(container.querySelector(".shadow-lg")).toBeFalsy();

    unmount(); // cleanup effect
  });

  test("non-radio blocks omit icon column; falsy option.value shows Any", async () => {
    const mod = await import("@/components/CampaignSettings.Script.QuestionBlock.Option");
    render(
      <mod.default
        block={{ id: "blk1", type: "text" } as any}
        option={{ value: "", content: "", next: "end" } as any}
        handleRemoveOption={() => {}}
        index={0}
        handleChange={() => {}}
        handleIconChange={() => {}}
        scriptData={{ pages: {}, blocks: {} } as any}
        addNewBlock={async () => "x"}
        handleNextChange={() => {}}
      />
    );
    expect(screen.getByText("Any")).toBeInTheDocument();
    expect(screen.queryByTestId("icon-A")).toBeNull();
  });

  test("icon mapping handles missing/unknown icon names", async () => {
    const mod = await import("@/components/CampaignSettings.Script.QuestionBlock.Option");
    render(
      <mod.default
        block={{ id: "blk1", type: "radio" } as any}
        option={{ value: "1", content: "x", next: "end" } as any} // no Icon
        handleRemoveOption={() => {}}
        index={0}
        handleChange={() => {}}
        handleIconChange={() => {}}
        scriptData={{ pages: {}, blocks: {} } as any}
        addNewBlock={async () => "x"}
        handleNextChange={() => {}}
      />
    );

    render(
      <mod.default
        block={{ id: "blk1", type: "radio" } as any}
        option={{ value: "1", content: "x", next: "end", Icon: "Missing" } as any}
        handleRemoveOption={() => {}}
        index={0}
        handleChange={() => {}}
        handleIconChange={() => {}}
        scriptData={{ pages: {}, blocks: {} } as any}
        addNewBlock={async () => "x"}
        handleNextChange={() => {}}
      />
    );
    // renders without crashing; missing icon renders no IconComponent
  });

  test("click outside closes icon picker only when click is outside container", async () => {
    const mod = await import("@/components/CampaignSettings.Script.QuestionBlock.Option");
    const { container } = render(
      <mod.default
        block={{ id: "blk1", type: "radio" } as any}
        option={{ value: "1", content: "x", next: "end", Icon: "A" } as any}
        handleRemoveOption={() => {}}
        index={0}
        handleChange={() => {}}
        handleIconChange={() => {}}
        scriptData={{ pages: { p1: { title: "P1", blocks: [] } }, blocks: {} } as any}
        addNewBlock={async () => "x"}
        handleNextChange={() => {}}
      />
    );

    const iconToggle = container.querySelectorAll("button")[1] as HTMLButtonElement;
    fireEvent.click(iconToggle);
    expect(container.querySelector(".shadow-lg")).toBeTruthy();

    // click inside container -> should remain open
    fireEvent.mouseDown(container.querySelector(".shadow-lg") as HTMLElement);
    expect(container.querySelector(".shadow-lg")).toBeTruthy();

    // click outside -> closes
    fireEvent.mouseDown(document.body);
    expect(container.querySelector(".shadow-lg")).toBeFalsy();
  });
});

