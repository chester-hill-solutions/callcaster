import { useId, useMemo, useState } from "react";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

import {
  formatCadFromCredits,
  formatCreditLabel,
  voiceCreditsFromDurationSeconds,
  type VoiceBillingKind,
  MMS_CREDITS,
  NUMBER_RENTAL_MONTHLY_CREDITS,
  SMS_SEGMENT_CREDITS,
} from "../../../shared/pricing";

type Inputs = {
  smsSegments: number;
  mmsMessages: number;
  agentDials: number;
  agentAverageMinutesPerDial: number;
  ivrDials: number;
  ivrAverageMinutesPerDial: number;
  phoneNumbers: number;
};

const INITIAL_INPUTS: Inputs = {
  smsSegments: 0,
  mmsMessages: 0,
  agentDials: 0,
  agentAverageMinutesPerDial: 1,
  ivrDials: 0,
  ivrAverageMinutesPerDial: 1,
  phoneNumbers: 0,
};

/** Clamp negatives and non-finite values (NaN, Infinity) to zero. */
function nonNegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

function voiceCreditsPerDial(
  minutesPerDial: number,
  kind: VoiceBillingKind,
): number {
  const seconds = nonNegative(minutesPerDial) * 60;
  return seconds > 0 && Number.isFinite(seconds)
    ? voiceCreditsFromDurationSeconds(seconds, kind)
    : 0;
}

export function estimateMonthlyCredits(inputs: Inputs): {
  breakdown: Array<{ key: string; label: string; credits: number }>;
  total: number;
} {
  const smsCredits = nonNegative(inputs.smsSegments) * SMS_SEGMENT_CREDITS;
  const mmsCredits = nonNegative(inputs.mmsMessages) * MMS_CREDITS;
  const agentCredits =
    nonNegative(inputs.agentDials) *
    voiceCreditsPerDial(inputs.agentAverageMinutesPerDial, "staffed");
  const ivrCredits =
    nonNegative(inputs.ivrDials) *
    voiceCreditsPerDial(inputs.ivrAverageMinutesPerDial, "ivr");
  const numberCredits =
    nonNegative(inputs.phoneNumbers) * NUMBER_RENTAL_MONTHLY_CREDITS;

  const breakdown = [
    { key: "sms", label: "SMS segments", credits: smsCredits },
    { key: "mms", label: "MMS messages", credits: mmsCredits },
    {
      key: "agent",
      label: "Calls placed by your agents",
      credits: agentCredits,
    },
    { key: "ivr", label: "IVR calls", credits: ivrCredits },
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

function CalculatorField({
  label,
  hint,
  value,
  min = 0,
  step = 1,
  onChange,
}: FieldProps) {
  const id = useId();
  return (
    <FormField htmlFor={id} label={label} description={hint}>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => {
          const raw = Number(event.target.value);
          onChange(Number.isFinite(raw) ? raw : 0);
        }}
        className="font-Zilla-Slab text-lg"
      />
    </FormField>
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
      className="border-border bg-card mt-6 overflow-hidden rounded-xl border"
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
            className="font-Zilla-Slab text-brand-primary text-2xl font-bold uppercase"
          >
            Estimate your usage
          </h3>
          <p className="font-Zilla-Slab text-muted-foreground text-base">
            Plug in a realistic mix and see the monthly credits + CAD equivalent
            update as you type.
          </p>
        </div>
        <span
          aria-hidden="true"
          className="font-Zilla-Slab text-muted-foreground text-2xl"
        >
          {expanded ? "−" : "+"}
        </span>
      </button>
      {expanded ? (
        <div id={bodyId} className="border-border border-t p-6">
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
              label="Agent calls / month"
              hint="Count calls placed by your own agents with a billable duration."
              value={inputs.agentDials}
              onChange={(agentDials) =>
                setInputs((prev) => ({ ...prev, agentDials }))
              }
            />
            <CalculatorField
              label="Average minutes per agent call"
              hint="Each additional started minute uses the agent-call rate."
              value={inputs.agentAverageMinutesPerDial}
              min={0}
              step={0.5}
              onChange={(agentAverageMinutesPerDial) =>
                setInputs((prev) => ({ ...prev, agentAverageMinutesPerDial }))
              }
            />
            <CalculatorField
              label="IVR calls / month"
              hint="Count IVR calls with a billable duration; zero-duration calls are excluded."
              value={inputs.ivrDials}
              onChange={(ivrDials) =>
                setInputs((prev) => ({ ...prev, ivrDials }))
              }
            />
            <CalculatorField
              label="Average minutes per IVR call"
              hint="Each additional started minute uses the IVR rate."
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
            className="divide-border mt-6 divide-y"
          >
            {breakdown.map((row) => (
              <div
                key={row.key}
                className="flex items-baseline justify-between py-2"
              >
                <dt className="font-Zilla-Slab text-foreground text-base">
                  {row.label}
                </dt>
                <dd
                  className="font-Zilla-Slab text-muted-foreground text-base"
                  data-testid={`calc-line-${row.key}`}
                >
                  {formatCreditLabel(row.credits)} ·{" "}
                  {formatCadFromCredits(row.credits)}
                </dd>
              </div>
            ))}
          </dl>

          <div
            className="bg-brand-primary/5 mt-4 flex items-baseline justify-between rounded-lg p-4"
            data-testid="calc-total"
          >
            <span className="font-Zilla-Slab text-foreground text-lg font-semibold">
              Monthly total
            </span>
            <span className="font-Zilla-Slab text-brand-primary text-2xl font-bold">
              {formatCreditLabel(total)} · {formatCadFromCredits(total)}
            </span>
          </div>

          <p className="font-Zilla-Slab text-muted-foreground mt-4 text-xs">
            Estimates only. Excludes taxes and carrier-specific variation. Calls
            placed by the CallCaster team are quoted per project — use the
            &ldquo;Reach out&rdquo; button in the pricing section above.
          </p>
        </div>
      ) : null}
    </section>
  );
}
