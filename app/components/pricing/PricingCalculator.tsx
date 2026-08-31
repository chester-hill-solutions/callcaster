import { useId, useMemo, useState } from "react";

import {
  formatCadFromCredits,
  formatCreditLabel,
  IVR_ADDITIONAL_MINUTE_CREDITS,
  IVR_FIRST_MINUTE_CREDITS,
  MMS_CREDITS,
  NUMBER_RENTAL_MONTHLY_CREDITS,
  SMS_SEGMENT_CREDITS,
} from "../../../shared/pricing";

/**
 * Interactive credit / CAD estimator for the public pricing page (#1393).
 *
 * The calculator is a progressive-disclosure block that lives BELOW the
 * pricing cards so the primary "here are the rates" comparison stays easy
 * to scan. Users type quantities into the four channels the pricing page
 * itemises (SMS segments, MMS, IVR / auto-dial minutes, rented phone
 * numbers) and see the monthly total update on every keystroke — no
 * form submit.
 *
 * Every rate reads directly from `shared/pricing.ts`; if the rate card
 * ships a change, this calculator changes with it. Staffed live calls
 * intentionally aren't a field — that's the "reach out" flow the
 * pricing page's own callout points at.
 */

type Inputs = {
  smsSegments: number;
  mmsMessages: number;
  ivrDials: number;
  ivrAverageMinutesPerDial: number;
  phoneNumbers: number;
};

const INITIAL_INPUTS: Inputs = {
  smsSegments: 0,
  mmsMessages: 0,
  ivrDials: 0,
  ivrAverageMinutesPerDial: 1,
  phoneNumbers: 0,
};

/** Clamp negatives and non-finite values (NaN, Infinity) to zero. */
function nonNegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

/**
 * Credits for one IVR / auto-dial call at N minutes:
 *   first minute at IVR_FIRST_MINUTE_CREDITS, every additional started
 *   minute at IVR_ADDITIONAL_MINUTE_CREDITS. A 0-minute call still bills
 *   for the first minute (matches voiceCreditsFromDurationSeconds).
 */
function ivrCreditsPerDial(minutesPerDial: number): number {
  const startedMinutes = Math.max(1, Math.ceil(nonNegative(minutesPerDial)));
  return (
    IVR_FIRST_MINUTE_CREDITS +
    Math.max(0, startedMinutes - 1) * IVR_ADDITIONAL_MINUTE_CREDITS
  );
}

/**
 * Public breakdown so tests and route-level renderers can trust the same
 * math the component uses. Exported (not inlined) so a rate-card change
 * has ONE arithmetic site to update everywhere.
 */
export function estimateMonthlyCredits(inputs: Inputs): {
  breakdown: Array<{ key: string; label: string; credits: number }>;
  total: number;
} {
  const smsCredits = nonNegative(inputs.smsSegments) * SMS_SEGMENT_CREDITS;
  const mmsCredits = nonNegative(inputs.mmsMessages) * MMS_CREDITS;
  const ivrCredits =
    nonNegative(inputs.ivrDials) *
    ivrCreditsPerDial(inputs.ivrAverageMinutesPerDial);
  const numberCredits =
    nonNegative(inputs.phoneNumbers) * NUMBER_RENTAL_MONTHLY_CREDITS;

  const breakdown = [
    { key: "sms", label: "SMS segments", credits: smsCredits },
    { key: "mms", label: "MMS messages", credits: mmsCredits },
    { key: "ivr", label: "IVR / auto-dial", credits: ivrCredits },
    { key: "numbers", label: "Phone number rentals", credits: numberCredits },
  ];
  const total = breakdown.reduce((sum, row) => sum + row.credits, 0);
  return { breakdown, total };
}

type FieldProps = {
  label: string;
  hint: string;
  value: number;
  min?: number;
  step?: number;
  onChange: (value: number) => void;
};

function CalculatorField({ label, hint, value, min = 0, step = 1, onChange }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="font-Zilla-Slab text-sm font-semibold text-foreground"
      >
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        aria-describedby={hintId}
        onChange={(event) => {
          const raw = Number(event.target.value);
          onChange(Number.isFinite(raw) ? raw : 0);
        }}
        className="w-full rounded-md border border-border bg-card px-3 py-2 font-Zilla-Slab text-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand-primary"
      />
      <p
        id={hintId}
        className="font-Zilla-Slab text-xs text-muted-foreground"
      >
        {hint}
      </p>
    </div>
  );
}

export function PricingCalculator() {
  const [inputs, setInputs] = useState<Inputs>(INITIAL_INPUTS);
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();
  const { breakdown, total } = useMemo(
    () => estimateMonthlyCredits(inputs),
    [inputs],
  );

  return (
    <section
      aria-labelledby={`${bodyId}-heading`}
      className="mt-6 overflow-hidden rounded-xl border border-border bg-card"
    >
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-controls={bodyId}
        className="flex w-full items-center justify-between gap-4 p-6 text-left"
      >
        <div>
          <h3
            id={`${bodyId}-heading`}
            className="font-Zilla-Slab text-2xl font-bold uppercase text-brand-primary"
          >
            Estimate your usage
          </h3>
          <p className="font-Zilla-Slab text-base text-muted-foreground">
            Plug in a realistic mix and see the monthly credits + CAD
            equivalent update as you type.
          </p>
        </div>
        <span aria-hidden="true" className="font-Zilla-Slab text-2xl text-muted-foreground">
          {expanded ? "−" : "+"}
        </span>
      </button>
      {expanded ? (
        <div id={bodyId} className="border-t border-border p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <CalculatorField
              label="SMS segments / month"
              hint="One long SMS spans multiple segments; check your typical message length."
              value={inputs.smsSegments}
              onChange={(smsSegments) =>
                setInputs((prev) => ({ ...prev, smsSegments }))
              }
            />
            <CalculatorField
              label="MMS messages / month"
              hint="Media messages are billed at a flat MMS rate regardless of body length."
              value={inputs.mmsMessages}
              onChange={(mmsMessages) =>
                setInputs((prev) => ({ ...prev, mmsMessages }))
              }
            />
            <CalculatorField
              label="IVR / auto-dial dials / month"
              hint="Count every outbound attempt — the first minute is billed even for very short calls."
              value={inputs.ivrDials}
              onChange={(ivrDials) =>
                setInputs((prev) => ({ ...prev, ivrDials }))
              }
            />
            <CalculatorField
              label="Average minutes per dial"
              hint="Additional minutes after the first are billed at the per-minute rate."
              value={inputs.ivrAverageMinutesPerDial}
              min={0}
              step={0.5}
              onChange={(ivrAverageMinutesPerDial) =>
                setInputs((prev) => ({ ...prev, ivrAverageMinutesPerDial }))
              }
            />
            <CalculatorField
              label="Phone numbers rented"
              hint="Each rented number renews monthly."
              value={inputs.phoneNumbers}
              onChange={(phoneNumbers) =>
                setInputs((prev) => ({ ...prev, phoneNumbers }))
              }
            />
          </div>

          <dl
            aria-label="Monthly usage breakdown"
            className="mt-6 divide-y divide-border"
          >
            {breakdown.map((row) => (
              <div
                key={row.key}
                className="flex items-baseline justify-between py-2"
              >
                <dt className="font-Zilla-Slab text-base text-foreground">
                  {row.label}
                </dt>
                <dd
                  className="font-Zilla-Slab text-base text-muted-foreground"
                  data-testid={`calc-line-${row.key}`}
                >
                  {formatCreditLabel(row.credits)} · {formatCadFromCredits(row.credits)}
                </dd>
              </div>
            ))}
          </dl>

          <div
            className="mt-4 flex items-baseline justify-between rounded-lg bg-brand-primary/5 p-4"
            data-testid="calc-total"
          >
            <span className="font-Zilla-Slab text-lg font-semibold text-foreground">
              Monthly total
            </span>
            <span className="font-Zilla-Slab text-2xl font-bold text-brand-primary">
              {formatCreditLabel(total)} · {formatCadFromCredits(total)}
            </span>
          </div>

          <p className="mt-4 font-Zilla-Slab text-xs text-muted-foreground">
            Estimates only. Excludes taxes and carrier-specific
            variation. Staffed live calls are quoted per project — use
            the &ldquo;Reach out&rdquo; button in the pricing section
            above.
          </p>
        </div>
      ) : null}
    </section>
  );
}
