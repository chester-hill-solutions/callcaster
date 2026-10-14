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
      agentDials: 0,
      agentAverageMinutesPerDial: 1,
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
      agentDials: 0,
      agentAverageMinutesPerDial: 1,
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
      agentDials: 0,
      agentAverageMinutesPerDial: 1,
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
      agentDials: 0,
      agentAverageMinutesPerDial: 1,
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
      agentDials: 0,
      agentAverageMinutesPerDial: 1,
      smsSegments: 0,
      mmsMessages: 0,
      ivrDials: 10,
      ivrAverageMinutesPerDial: 1.5,
      phoneNumbers: 0,
    });
    const expected = 10 * (IVR_FIRST_MINUTE_CREDITS + 1 * IVR_ADDITIONAL_MINUTE_CREDITS);
    expect(breakdown.find((row) => row.key === "ivr")?.credits).toBe(expected);
  });

  test("IVR: zero-duration calls have no billable credits", () => {
    const { breakdown } = estimateMonthlyCredits({
      agentDials: 0,
      agentAverageMinutesPerDial: 1,
      smsSegments: 0,
      mmsMessages: 0,
      ivrDials: 3,
      ivrAverageMinutesPerDial: 0,
      phoneNumbers: 0,
    });
    expect(breakdown.find((row) => row.key === "ivr")?.credits).toBe(0);
  });

  test("phone-number rental multiplies count by monthly rate", () => {
    const { breakdown } = estimateMonthlyCredits({
      agentDials: 0,
      agentAverageMinutesPerDial: 1,
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
      agentDials: 0,
      agentAverageMinutesPerDial: 1,
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
      agentDials: 0,
      agentAverageMinutesPerDial: 1,
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
  test("agent and IVR fields retain distinct rates, CAD totals and team quotes", () => {
    render(<PricingCalculator />);
    fireEvent.click(screen.getByRole("button", { name: /estimate your usage/i }));
    expect(screen.getByLabelText("Agent calls / month")).toHaveAccessibleDescription("Count calls placed by your own agents with a billable duration.");
    expect(screen.getByLabelText("IVR calls / month")).toHaveAccessibleDescription("Count IVR calls with a billable duration; zero-duration calls are excluded.");
    fireEvent.change(screen.getByLabelText("Agent calls / month"), { target: { value: "1" } });
    expect(screen.getByTestId("calc-line-agent")).toHaveTextContent("4 credits");
    fireEvent.change(screen.getByLabelText("Average minutes per agent call"), { target: { value: "5" } });
    expect(screen.getByTestId("calc-line-agent")).toHaveTextContent("24 credits · $0.48");
    expect(screen.getByTestId("calc-line-ivr")).toHaveTextContent("0 credits");
    fireEvent.change(screen.getByLabelText("IVR calls / month"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Average minutes per IVR call"), { target: { value: "5" } });
    expect(screen.getByTestId("calc-line-ivr")).toHaveTextContent("14 credits · $0.28");
    expect(screen.getByTestId("calc-total")).toHaveTextContent("38 credits · $0.76");
    fireEvent.change(screen.getByLabelText("SMS segments / month"), { target: { value: "100" } });
    expect(screen.getByTestId("calc-total")).toHaveTextContent("238 credits · $4.76");
    fireEvent.change(screen.getByLabelText("Average minutes per IVR call"), { target: { value: "0" } });
    expect(screen.getByTestId("calc-line-ivr")).toHaveTextContent("0 credits");
    expect(screen.getByTestId("calc-total")).toHaveTextContent("224 credits · $4.48");
    expect(screen.getByText(/Calls placed by the CallCaster team are quoted per project/)).toBeInTheDocument();
    expect(screen.getByText(/zero-duration calls are excluded/)).toBeInTheDocument();
  });

  test.each([
    { minutes: 1 / 60, agent: 4, ivr: 2 },
    { minutes: 1, agent: 4, ivr: 2 },
    { minutes: 61 / 60, agent: 9, ivr: 5 },
    { minutes: 5, agent: 24, ivr: 14 },
    { minutes: 0, agent: 0, ivr: 0 },
    { minutes: -1, agent: 0, ivr: 0 },
    { minutes: Number.NaN, agent: 0, ivr: 0 },
    { minutes: Number.POSITIVE_INFINITY, agent: 0, ivr: 0 },
  ])("estimates both voice lanes at $minutes minutes", ({ minutes, agent, ivr }) => {
    const { breakdown, total } = estimateMonthlyCredits({
      smsSegments: 0,
      mmsMessages: 0,
      agentDials: 1,
      agentAverageMinutesPerDial: minutes,
      ivrDials: 1,
      ivrAverageMinutesPerDial: minutes,
      phoneNumbers: 0,
    });
    expect(breakdown.find((row) => row.key === "agent")?.credits).toBe(agent);
    expect(breakdown.find((row) => row.key === "ivr")?.credits).toBe(ivr);
    expect(total).toBe(agent + ivr);
  });

  test("invalid agent counts contribute no credits", () => {
    for (const agentDials of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { total } = estimateMonthlyCredits({
        smsSegments: 0, mmsMessages: 0, agentDials, agentAverageMinutesPerDial: 5,
        ivrDials: 0, ivrAverageMinutesPerDial: 5, phoneNumbers: 0,
      });
      expect(total).toBe(0);
    }
  });

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

    const smsInput = screen.getByLabelText(/SMS segments/i);
    const total = screen.getByTestId("calc-total");

    // Empty state: total reads "0 credits" (formatCreditLabel: 0 → "0 credits").
    expect(total.textContent).toMatch(/0 credits/);

    fireEvent.change(smsInput, { target: { value: "100" } });

    // 100 segments × 2 credits = 200 credits. formatCreditLabel emits "200 credits".
    expect(screen.getByTestId("calc-line-sms").textContent).toMatch(/200 credits/);
    expect(total.textContent).toMatch(/200 credits/);
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
