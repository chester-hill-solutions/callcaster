import { createRef, type ComponentRef } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateTimePicker, TimePicker } from "../../app/components/ui/datetime";
vi.hoisted(() => {
  process.env.TZ = "UTC";
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-05T10:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const april = new Date("2026-04-14T09:00:00Z");
const may = new Date("2026-05-18T15:00:00Z");
async function showDate(value: Date | undefined = april) {
  const props = { value, onChange: vi.fn(), granularity: "day" as const };
  const view = render(<DateTimePicker {...props} />);
  await userEvent.click(screen.getByRole("button"));
  expect(screen.getByText("April 2026", { exact: true })).toBeInTheDocument();
  return { view, props };
}
test("external April-to-May value updates the mounted calendar month", async () => {
  const { view, props } = await showDate();
  view.rerender(<DateTimePicker {...props} value={may} />);
  expect(screen.getByText("May 2026", { exact: true })).toBeInTheDocument();
  expect(screen.getByRole("gridcell", { name: "18", selected: true })).toBeInTheDocument();
});
test("clearing value resets the mounted calendar to the current month", async () => {
  const { view, props } = await showDate();
  view.rerender(<DateTimePicker {...props} value={undefined} />);
  expect(screen.getByText("October 2026", { exact: true })).toBeInTheDocument();
  expect(screen.queryByRole("gridcell", { selected: true })).not.toBeInTheDocument();
});
test("external morning-to-afternoon date updates the rendered period Select", () => {
  const view = render(
    <TimePicker date={april} hourCycle={12} onChange={vi.fn()} />,
  );
  expect(screen.getByRole("combobox")).toHaveTextContent("AM");
  view.rerender(<TimePicker date={may} hourCycle={12} onChange={vi.fn()} />);
  expect(screen.getByRole("combobox")).toHaveTextContent("PM");
});
test("clearing an afternoon date resets the rendered period Select", () => {
  const view = render(
    <TimePicker date={may} hourCycle={12} onChange={vi.fn()} />,
  );
  expect(screen.getByRole("combobox")).toHaveTextContent("PM");
  view.rerender(
    <TimePicker date={undefined} hourCycle={12} onChange={vi.fn()} />,
  );
  expect(screen.getByRole("combobox")).toHaveTextContent("AM");
});
test("initial calendar follows its controlled date", async () => {
  await showDate();
});
test("intentional next-month navigation remains possible", async () => {
  await showDate();
  await userEvent.click(
    screen.getByRole("button", { name: "Go to next month" }),
  );
  expect(screen.getByText("May 2026", { exact: true })).toBeInTheDocument();
});

test("same timestamp in a new Date object preserves intentional navigation", async () => {
  const { view, props } = await showDate();
  await userEvent.click(
    screen.getByRole("button", { name: "Go to next month" }),
  );
  view.rerender(
    <DateTimePicker {...props} value={new Date(april.getTime())} />,
  );
  expect(screen.getByText("May 2026", { exact: true })).toBeInTheDocument();
});
test("external synchronization emits no date mutation", async () => {
  const { view, props } = await showDate();
  view.rerender(<DateTimePicker {...props} value={may} />);
  view.rerender(<DateTimePicker {...props} value={undefined} />);
  expect(props.onChange).not.toHaveBeenCalled();
});
test("external time synchronization emits no time mutation", () => {
  const onChange = vi.fn();
  const view = render(
    <TimePicker date={april} hourCycle={12} onChange={onChange} />,
  );
  view.rerender(<TimePicker date={may} hourCycle={12} onChange={onChange} />);
  view.rerender(
    <TimePicker date={undefined} hourCycle={12} onChange={onChange} />,
  );
  expect(onChange).not.toHaveBeenCalled();
});
test("24-hour controls retain their external hours without a period selector", () => {
  const view = render(
    <TimePicker date={april} hourCycle={24} onChange={vi.fn()} />,
  );
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(document.getElementById("datetime-picker-hour-input")).toHaveValue(
    "09",
  );
  view.rerender(<TimePicker date={may} hourCycle={24} onChange={vi.fn()} />);
  expect(document.getElementById("datetime-picker-hour-input")).toHaveValue(
    "15",
  );
});

test("period selection after an external update changes only the intended half-day", async () => {
  const onChange = vi.fn();
  const view = render(
    <TimePicker date={april} hourCycle={12} onChange={onChange} />,
  );
  view.rerender(<TimePicker date={may} hourCycle={12} onChange={onChange} />);
  await userEvent.click(screen.getByRole("combobox"));
  await userEvent.click(
    screen.getByRole("option", { name: "AM", exact: true }),
  );
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(new Date("2026-05-18T03:00:00Z"));
});
test("keyboard focus still advances from hours to minutes after an external update", async () => {
  const ref = createRef<ComponentRef<typeof TimePicker>>();
  const view = render(
    <TimePicker ref={ref} date={april} hourCycle={24} onChange={vi.fn()} />,
  );
  view.rerender(
    <TimePicker ref={ref} date={may} hourCycle={24} onChange={vi.fn()} />,
  );
  await userEvent.click(screen.getByDisplayValue("15"));
  await userEvent.keyboard("{ArrowRight}");
  expect(ref.current?.minuteRef).toHaveFocus();
});
