import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import SelectDates from "@/components/campaign/settings/basic/CampaignBasicInfo.Dates";
import { WEEKDAY_KEYS, type WeekdayKey } from "@/lib/schedule-intervals";
import type { ScheduleDay, ScheduleInterval } from "@/lib/types";
import { makeCampaign } from "./_helpers/component-smoke";

vi.hoisted(() => {
  process.env.TZ = "UTC";
});
vi.mock("@/lib/schedule-timezone", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/schedule-timezone")>(),
  browserTimeZone: () => "America/Toronto",
}));

type Week = Record<WeekdayKey, ScheduleDay>;
const morning = { start: "14:00", end: "17:00" };
const afternoon = { start: "18:00", end: "02:00" };
function week(intervals: ScheduleInterval[] = [{ start: "14:00", end: "02:00" }]): Week {
  return {
    monday: { active: true, intervals: [...intervals] },
    tuesday: { active: true, intervals: [...intervals] },
    wednesday: { active: true, intervals: [...intervals] },
    thursday: { active: true, intervals: [...intervals] },
    friday: { active: true, intervals: [...intervals] },
    saturday: { active: true, intervals: [...intervals] },
    sunday: { active: true, intervals: [...intervals] },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe.each([
  { type: "live_call", field: "schedule", editor: "Calling Hours", empty: "No calling hours set" },
  { type: "message", field: "sms_send_window", editor: "Send Window", empty: "No send window set" },
])("collapsed $editor (#2626)", ({ type, field, editor, empty }) => {
  function show(schedule: Week | null) {
    const onChange = vi.fn();
    const campaign = makeCampaign({ type, schedule: null, sms_send_window: null, [field]: schedule });
    const result = render(<SelectDates campaignData={campaign} handleInputChange={onChange} />);
    return { ...result, onChange };
  }

  test("groups seven matching days and keeps timezone and calling safeguards", () => {
    const { container, onChange } = show(week());
    const summary = screen.getByLabelText("Weekly schedule summary");
    expect(within(summary).getByText("Every day:")).toBeInTheDocument();
    expect(within(summary).getByText("09:00–21:00")).toBeInTheDocument();
    expect(within(summary).getAllByRole("definition")).toHaveLength(1);
    expect(screen.getByText(/Times are shown in your local time zone/)).toHaveTextContent("America/Toronto");
    expect(screen.getByText(/Times are shown in your local time zone/)).toHaveTextContent("8:00 a.m. and 9:00 p.m. in their own time zone");
    expect(screen.getByRole("heading", { name: editor })).toBeInTheDocument();
    expect(container.querySelector('[class*="bg-brand-secondary"]')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  test("groups complete interval sets regardless of order without changing editor order", () => {
    const schedule = week([morning, afternoon]);
    schedule.monday.intervals = [afternoon, morning];
    const before = JSON.stringify(schedule);
    show(schedule);
    const summary = screen.getByLabelText("Weekly schedule summary");
    expect(within(summary).getByText("Every day:")).toBeInTheDocument();
    expect(within(summary).getByText("09:00–12:00, 13:00–21:00")).toBeInTheDocument();
    expect(within(summary).getAllByRole("definition")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${editor}` }));
    expect(screen.getByLabelText("Monday start time")).toHaveValue("13:00");
    expect(screen.getByLabelText("Tuesday start time")).toHaveValue("09:00");
    expect(JSON.stringify(schedule)).toBe(before);
  });

  test("keeps a differing second interval and inactive day discoverable", () => {
    const schedule = week([morning, afternoon]);
    schedule.saturday.intervals = [morning, { start: "19:00", end: "01:00" }];
    schedule.sunday = { active: false, intervals: [] };
    show(schedule);
    const summary = screen.getByLabelText("Weekly schedule summary");
    expect(within(summary).queryByText("Every day:")).not.toBeInTheDocument();
    expect(within(summary).getByText("Monday, Tuesday, Wednesday, Thursday, Friday:")).toBeInTheDocument();
    expect(within(summary).getByText("09:00–12:00, 13:00–21:00")).toBeInTheDocument();
    expect(within(summary).getByText("Saturday:")).toBeInTheDocument();
    expect(within(summary).getByText("09:00–12:00, 14:00–20:00")).toBeInTheDocument();
    expect(within(summary).getByText("Sunday:")).toBeInTheDocument();
    expect(within(summary).getByText("Inactive")).toBeInTheDocument();
    expect(within(summary).getAllByRole("definition")).toHaveLength(3);
  });

  test("distinguishes full days, overnight ranges and active days with no intervals", () => {
    const schedule = week([]);
    for (const day of WEEKDAY_KEYS) schedule[day].active = false;
    schedule.monday = { active: true, intervals: [{ start: "00:00", end: "23:59" }] };
    schedule.tuesday = { active: true, intervals: [{ start: "02:00", end: "07:00" }] };
    schedule.wednesday = { active: true, intervals: [] };
    show(schedule);
    const summary = screen.getByLabelText("Weekly schedule summary");
    expect(within(summary).getByText("Monday:")).toBeInTheDocument();
    expect(within(summary).getByText("All day")).toBeInTheDocument();
    expect(within(summary).getByText("Tuesday:")).toBeInTheDocument();
    expect(within(summary).getByText("21:00–02:00")).toBeInTheDocument();
    expect(within(summary).getByText("Wednesday:")).toBeInTheDocument();
    expect(within(summary).getByText("No intervals set")).toBeInTheDocument();
    expect(within(summary).getByText("Thursday, Friday, Saturday, Sunday:")).toBeInTheDocument();
    expect(within(summary).getByText("Inactive")).toBeInTheDocument();
  });

  test.each([null, "inactive"])("retains the empty state for %s schedules", (kind) => {
    const schedule = kind === null ? null : week([]);
    if (schedule) for (const day of WEEKDAY_KEYS) schedule[day].active = false;
    const { onChange } = show(schedule);
    expect(screen.getByText(empty)).toBeInTheDocument();
    expect(screen.queryByLabelText("Weekly schedule summary")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Edit ${editor}` })).toBeEnabled();
    expect(onChange).not.toHaveBeenCalled();
  });

  test("uses the channel's distinct saved schedule", () => {
    const voice = week();
    const sms = week([{ start: "15:00", end: "01:00" }]);
    render(<SelectDates campaignData={makeCampaign({ type, schedule: voice, sms_send_window: sms })} handleInputChange={vi.fn()} />);
    const summary = screen.getByLabelText("Weekly schedule summary");
    expect(within(summary).getByText(type === "message" ? "10:00–20:00" : "09:00–21:00")).toBeInTheDocument();
    expect(within(summary).queryByText(type === "message" ? "09:00–21:00" : "10:00–20:00")).not.toBeInTheDocument();
  });

  test("Edit and Hide retain later intervals while edits write the correct field", () => {
    const schedule = week([morning, afternoon]);
    const { container, onChange } = show(schedule);
    const edit = screen.getByRole("button", { name: `Edit ${editor}` });
    expect(edit).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(edit);
    expect(screen.queryByLabelText("Weekly schedule summary")).not.toBeInTheDocument();
    expect(container.querySelectorAll('input[type="time"]')).toHaveLength(14);
    for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]) {
      expect(screen.getByLabelText(`${day} start time`)).toBeEnabled();
      expect(screen.getByLabelText(`${day} end time`)).toBeEnabled();
    }
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Monday start time"), { target: { value: "10:15" } });
    const expected = { ...schedule, monday: { active: true, intervals: [{ start: "15:15", end: "17:00" }, afternoon] } };
    expect(onChange).toHaveBeenCalledExactlyOnceWith(field, JSON.stringify(expected));
    fireEvent.click(screen.getByRole("button", { name: `Hide ${editor}` }));
    const summary = screen.getByLabelText("Weekly schedule summary");
    expect(within(summary).getByText("Monday:")).toBeInTheDocument();
    expect(within(summary).getByText("10:15–12:00, 13:00–21:00")).toBeInTheDocument();
    expect(within(summary).getByText("Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday:")).toBeInTheDocument();
    expect(within(summary).getByText("09:00–12:00, 13:00–21:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Edit ${editor}` })).toHaveAttribute("aria-expanded", "false");
  });
});
