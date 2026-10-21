import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import SelectDates from "@/components/campaign/settings/basic/CampaignBasicInfo.Dates";
import { makeCampaign } from "./_helpers/component-smoke";

vi.hoisted(() => {
  process.env.TZ = "UTC";
});

vi.mock("@/lib/schedule-timezone", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/schedule-timezone")>(),
  browserTimeZone: () => "America/Toronto",
}));

const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const timeZoneHelp = "Times are shown in your local time zone (America/Toronto).";

function savedSchedule() {
  return {
    monday: { active: true, intervals: [{ start: "14:00", end: "22:30" }] },
    tuesday: { active: false, intervals: [] },
    wednesday: { active: false, intervals: [] },
    thursday: { active: false, intervals: [] },
    friday: { active: false, intervals: [] },
    saturday: { active: false, intervals: [] },
    sunday: { active: false, intervals: [] },
  };
}

function lastSavedValue(onChange: { mock: { calls: unknown[][] } }): string {
  const value = onChange.mock.calls.at(-1)?.[1];
  if (typeof value !== "string") {
    throw new Error("Expected a saved schedule string.");
  }
  return value;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe.each([
  { type: "live_call", editor: "Calling Hours", field: "schedule", endHelp: "The latest time to begin dialing." },
  { type: "message", editor: "Send Window", field: "sms_send_window", endHelp: "The latest time to send messages." },
])("weekly $editor", ({ type, editor, field, endHelp }) => {
  test("names all 14 time controls and connects their timezone and end guidance", () => {
    const onChange = vi.fn();
    const { container } = render(<SelectDates
      campaignData={makeCampaign({ type, schedule: null, sms_send_window: null, [field]: savedSchedule() })}
      handleInputChange={onChange}
    />);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${editor}` }));

    expect(container.querySelectorAll('input[type="time"]')).toHaveLength(14);
    for (const day of dayNames) {
      for (const part of ["start", "end"]) {
        const name = `${day} ${part} time`;
        const input = screen.getByLabelText(name);
        expect(input).toHaveAccessibleName(name);
        expect(input).toHaveAttribute("id", `${day.toLowerCase()}-${part}`);
        expect(input).toHaveAttribute("name", `${day.toLowerCase()}-${part}`);
        expect(input).toHaveAccessibleDescription(part === "end" ? `${timeZoneHelp} ${endHelp}` : timeZoneHelp);
        if (day === "Monday") expect(input).toBeEnabled();
        else expect(input).toBeDisabled();
      }
    }
    expect(screen.getByLabelText("Monday start time")).toHaveValue("09:00");
    expect(screen.getByLabelText("Monday end time")).toHaveValue("17:30");
    expect(screen.getByRole("columnheader", { name: "Start (America/Toronto)" })).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  test("edits local times in the correct stored field and restores saved values", () => {
    const onChange = vi.fn();
    const campaign = makeCampaign({ type, schedule: null, sms_send_window: null, [field]: savedSchedule() });
    const { rerender } = render(<SelectDates campaignData={campaign} handleInputChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${editor}` }));

    fireEvent.change(screen.getByLabelText("Monday start time"), { target: { value: "10:15" } });
    expect(onChange).toHaveBeenLastCalledWith(field, expect.any(String));
    expect(JSON.parse(lastSavedValue(onChange))).toEqual({
      ...savedSchedule(),
      monday: { active: true, intervals: [{ start: "15:15", end: "22:30" }] },
    });
    fireEvent.change(screen.getByLabelText("Monday end time"), { target: { value: "18:45" } });
    expect(onChange).toHaveBeenLastCalledWith(field, expect.any(String));
    expect(JSON.parse(lastSavedValue(onChange)).monday).toEqual({
      active: true, intervals: [{ start: "15:15", end: "23:45" }],
    });
    expect(screen.getByLabelText("Monday start time")).toHaveValue("10:15");
    expect(screen.getByLabelText("Monday end time")).toHaveValue("18:45");

    fireEvent.click(screen.getByLabelText("Sunday active"));
    expect(screen.getByLabelText("Sunday start time")).toBeEnabled();
    expect(screen.getByLabelText("Sunday start time")).toHaveValue("09:00");
    expect(screen.getByLabelText("Sunday end time")).toHaveValue("21:00");
    expect(JSON.parse(lastSavedValue(onChange)).sunday).toEqual({
      active: true, intervals: [{ start: "14:00", end: "02:00" }],
    });
    fireEvent.click(screen.getByLabelText("Sunday active"));
    expect(screen.getByLabelText("Sunday start time")).toBeDisabled();
    expect(screen.getByLabelText("Sunday end time")).toBeDisabled();
    expect(JSON.parse(lastSavedValue(onChange)).sunday).toEqual({ active: false, intervals: [] });

    const changedValue = lastSavedValue(onChange);
    rerender(<SelectDates campaignData={makeCampaign({ type, schedule: null, sms_send_window: null, [field]: changedValue })} handleInputChange={onChange} />);
    rerender(<SelectDates campaignData={campaign} handleInputChange={onChange} />);
    expect(screen.getByLabelText("Monday start time")).toHaveValue("09:00");
    expect(screen.getByLabelText("Monday end time")).toHaveValue("17:30");
    expect(onChange).toHaveBeenCalledTimes(4);
  });

  test("preserves weekday and all-day presets in local time", () => {
    const onChange = vi.fn();
    const schedule = {
      ...savedSchedule(),
      saturday: { active: true, intervals: [{ start: "20:30", end: "21:30" }] },
    };
    render(<SelectDates
      campaignData={makeCampaign({ type, schedule: null, sms_send_window: null, [field]: schedule })}
      handleInputChange={onChange}
    />);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${editor}` }));
    fireEvent.click(screen.getByRole("button", { name: "Apply 09:00–21:00 local to Weekdays" }));
    expect(onChange).toHaveBeenLastCalledWith(field, expect.any(String));
    const weekdays = JSON.parse(lastSavedValue(onChange));
    for (const day of ["monday", "tuesday", "wednesday", "thursday", "friday"]) {
      expect(weekdays[day]).toEqual({ active: true, intervals: [{ start: "14:00", end: "02:00" }] });
    }
    expect(weekdays.saturday).toEqual(schedule.saturday);
    expect(weekdays.sunday).toEqual({ active: false, intervals: [] });
    expect(screen.getByLabelText("Monday start time")).toHaveValue("09:00");
    expect(screen.getByLabelText("Monday end time")).toHaveValue("21:00");
    expect(screen.getByLabelText("Saturday start time")).toHaveValue("15:30");
    expect(screen.getByLabelText("Saturday end time")).toHaveValue("16:30");
    expect(screen.getByLabelText("Sunday start time")).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Apply 09:00–21:00 local to All Days" }));
    expect(onChange).toHaveBeenLastCalledWith(field, expect.any(String));
    const allDays = JSON.parse(lastSavedValue(onChange));
    for (const day of dayNames) {
      expect(allDays[day.toLowerCase()]).toEqual({ active: true, intervals: [{ start: "14:00", end: "02:00" }] });
      expect(screen.getByLabelText(`${day} start time`)).toBeEnabled();
      expect(screen.getByLabelText(`${day} start time`)).toHaveValue("09:00");
      expect(screen.getByLabelText(`${day} end time`)).toHaveValue("21:00");
    }
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
