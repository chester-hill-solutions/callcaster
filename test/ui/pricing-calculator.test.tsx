import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import {
  estimateMonthlyCredits,
  PricingCalculator,
} from "@/components/pricing/PricingCalculator";
import {
  IVR_ADDITIONAL_MINUTE_CREDITS,
  IVR_FIRST_MINUTE_CREDITS,
  MMS_CREDITS,
  NUMBER_RENTAL_MONTHLY_CREDITS,
  SMS_SEGMENT_CREDITS,
} from "../../shared/pricing";

describe("estimateMonthlyCredits (#1393)", () => {
  test("empty input totals zero across every channel", () => {
    const { breakdown, total } = estimateMonthlyCredits({
      smsSegments: 0,
      mmsMessages: 0,
      ivrDials: 0,
      ivrAverageMinutesPerDial: 0,
      phoneNumbers: 0,
    });
    for (const row of breakdown) {
      expect(row.credits).toBe(0);
    }
    expect(total).toBe(0);
  });

  test("SMS-only usage multiplies segments by SMS_SEGMENT_CREDITS", () => {
    const { breakdown, total } = estimateMonthlyCredits({
      smsSegments: 250,
      mmsMessages: 0,
      ivrDials: 0,
      ivrAverageMinutesPerDial: 0,
      phoneNumbers: 0,
    });
    const sms = breakdown.find((row) => row.key === "sms");
    expect(sms?.credits).toBe(250 * SMS_SEGMENT_CREDITS);
    expect(total).toBe(250 * SMS_SEGMENT_CREDITS);
  });

  test("MMS is billed flat regardless of length", () => {
    const { breakdown } = estimateMonthlyCredits({
      smsSegments: 0,
      mmsMessages: 10,
      ivrDials: 0,
      ivrAverageMinutesPerDial: 0,
      phoneNumbers: 0,
    });
    expect(breakdown.find((row) => row.key === "mms")?.credits).toBe(10 * MMS_CREDITS);
  });

  test("IVR bills the first minute + additional started minutes per dial", () => {
    // 5 dials × 3 minutes each = 5 × (first + 2 × additional)
    const { breakdown } = estimateMonthlyCredits({
      smsSegments: 0,
      mmsMessages: 0,
      ivrDials: 5,
      ivrAverageMinutesPerDial: 3,
      phoneNumbers: 0,
    });
    const expected = 5 * (IVR_FIRST_MINUTE_CREDITS + 2 * IVR_ADDITIONAL_MINUTE_CREDITS);
    expect(breakdown.find((row) => row.key === "ivr")?.credits).toBe(expected);
  });

  test("IVR: a fractional average minute rounds up to a whole started minute", () => {
    // 10 dials × 1.5 minutes each — started minutes = 2, so first + 1 × additional.
    const { breakdown } = estimateMonthlyCredits({
      smsSegments: 0,
      mmsMessages: 0,
      ivrDials: 10,
      ivrAverageMinutesPerDial: 1.5,
      phoneNumbers: 0,
    });
    const expected = 10 * (IVR_FIRST_MINUTE_CREDITS + 1 * IVR_ADDITIONAL_MINUTE_CREDITS);
    expect(breakdown.find((row) => row.key === "ivr")?.credits).toBe(expected);
  });

  test("IVR: a 0-minute dial still bills for the first minute (matches server-side rule)", () => {
    // A no-connect / hangup-on-answer dial still consumes the first-minute
    // credit — the calculator matches voiceCreditsFromDurationSeconds so a
    // customer isn't surprised at bill time.
    const { breakdown } = estimateMonthlyCredits({
      smsSegments: 0,
      mmsMessages: 0,
      ivrDials: 3,
      ivrAverageMinutesPerDial: 0,
      phoneNumbers: 0,
    });
    expect(breakdown.find((row) => row.key === "ivr")?.credits).toBe(3 * IVR_FIRST_MINUTE_CREDITS);
  });

  test("phone-number rental multiplies count by monthly rate", () => {
    const { breakdown } = estimateMonthlyCredits({
      smsSegments: 0,
      mmsMessages: 0,
      ivrDials: 0,
      ivrAverageMinutesPerDial: 0,
      phoneNumbers: 4,
    });
    expect(breakdown.find((row) => row.key === "numbers")?.credits).toBe(4 * NUMBER_RENTAL_MONTHLY_CREDITS);
  });

  test("mixed usage sums every channel into the total", () => {
    const { total } = estimateMonthlyCredits({
      smsSegments: 100,
      mmsMessages: 5,
      ivrDials: 20,
      ivrAverageMinutesPerDial: 2,
      phoneNumbers: 2,
    });
    const expected =
      100 * SMS_SEGMENT_CREDITS +
      5 * MMS_CREDITS +
      20 * (IVR_FIRST_MINUTE_CREDITS + 1 * IVR_ADDITIONAL_MINUTE_CREDITS) +
      2 * NUMBER_RENTAL_MONTHLY_CREDITS;
    expect(total).toBe(expected);
  });

  test("negative or NaN inputs are clamped to zero (defensive)", () => {
    const { total } = estimateMonthlyCredits({
      smsSegments: -50,
      mmsMessages: Number.NaN,
      ivrDials: -1,
      ivrAverageMinutesPerDial: -100,
      phoneNumbers: -3,
    });
    expect(total).toBe(0);
  });
});

describe("PricingCalculator (#1393)", () => {
  test("starts collapsed — the primary rate cards stay easy to scan", () => {
    render(<PricingCalculator />);
    // The heading is always visible.
    expect(screen.getByRole("heading", { name: /estimate your usage/i })).toBeInTheDocument();
    // Fields are not visible until expanded.
    expect(screen.queryByLabelText(/SMS segments/i)).toBeNull();
  });

  test("expanding reveals inputs and a total row that updates as fields change", () => {
    render(<PricingCalculator />);
    fireEvent.click(screen.getByRole("button", { name: /estimate your usage/i }));

    const smsInput = screen.getByLabelText(/SMS segments/i) as HTMLInputElement;
    const total = screen.getByTestId("calc-total");

    // Empty state: total reads "0 credits" (formatCreditLabel: 0 → "0 credits").
    expect(total.textContent).toMatch(/0 credits/);

    fireEvent.change(smsInput, { target: { value: "100" } });

    // 100 segments × 1 credit = 100 credits. formatCreditLabel emits "100 credits".
    expect(screen.getByTestId("calc-line-sms").textContent).toMatch(/100 credits/);
    expect(total.textContent).toMatch(/100 credits/);
  });

  test("expanding a second time collapses back to the heading only", () => {
    render(<PricingCalculator />);
    const toggle = screen.getByRole("button", { name: /estimate your usage/i });
    fireEvent.click(toggle);
    expect(screen.getByLabelText(/SMS segments/i)).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.queryByLabelText(/SMS segments/i)).toBeNull();
  });
});
