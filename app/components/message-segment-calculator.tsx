import { useMemo, useState, type CSSProperties } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";
import { getSmsSegmentInfo } from "@/lib/sms-segments";
import { CREDIT_PRICE_CAD, SMS_SEGMENT_CREDITS } from "@/lib/pricing";

type EncodingChoice = "auto" | "GSM-7" | "UCS-2";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-border bg-background rounded-lg border px-4 py-3">
      <dt className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-foreground mt-1 text-xl font-semibold">{value}</dd>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-border flex items-baseline justify-between gap-4 border-b py-2 last:border-0">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-foreground text-right text-sm font-medium">
        {value}
      </dd>
    </div>
  );
}

function CharacterDetails({ characters }: { characters: string[] }) {
  return (
    <details className="border-border rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">
        Character detail
      </summary>
      {characters.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-sm">
          No characters outside GSM-7 were found.
        </p>
      ) : (
        <ul className="divide-border mt-2 divide-y">
          {characters.map((character) => (
            <li
              key={character}
              className="flex justify-between gap-3 py-2 text-sm"
            >
              <span className="font-mono">
                {character === " " ? "space" : character}
              </span>
              <code className="text-muted-foreground">
                U+
                {character
                  .codePointAt(0)
                  ?.toString(16)
                  .toUpperCase()
                  .padStart(4, "0")}
              </code>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

export function MessageSegmentCalculator() {
  const [message, setMessage] = useState("");
  const [encodingChoice, setEncodingChoice] = useState<EncodingChoice>("auto");

  const result = useMemo(() => {
    const automatic = getSmsSegmentInfo(message);
    const encoding =
      encodingChoice === "auto" ? automatic.encoding : encodingChoice;
    const totalUnits =
      encoding === "GSM-7" ? automatic.totalUnits : message.length;
    const unsupportedForGsm =
      encoding === "GSM-7" && automatic.encoding !== "GSM-7";
    const singleLimit = encoding === "GSM-7" ? 160 : 70;
    const multiLimit = encoding === "GSM-7" ? 153 : 67;
    const segmentCapacity = totalUnits > singleLimit ? multiLimit : singleLimit;
    const segments =
      totalUnits === 0 ? 0 : Math.ceil(totalUnits / segmentCapacity);
    const displayedSegments = Math.max(1, segments);
    const usedInCurrentSegment =
      totalUnits === 0 ? 0 : totalUnits % segmentCapacity || segmentCapacity;
    const remaining =
      totalUnits === 0
        ? singleLimit
        : segmentCapacity - (totalUnits - (segments - 1) * segmentCapacity);
    const nonGsmCharacters = Array.from(
      new Set(
        Array.from(message).filter(
          (character) => getSmsSegmentInfo(character).encoding !== "GSM-7",
        ),
      ),
    );
    return {
      encoding,
      totalUnits,
      segments,
      displayedSegments,
      segmentCapacity,
      usedInCurrentSegment,
      segmentUsagePercent: (usedInCurrentSegment / segmentCapacity) * 100,
      remaining,
      unsupportedForGsm,
      nonGsmCharacters,
      characterCount: Array.from(message).length,
    };
  }, [encodingChoice, message]);

  const messageSize =
    result.encoding === "GSM-7"
      ? `${result.totalUnits * 7} bits`
      : `${result.totalUnits * 16} bits`;
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-5 space-y-1.5">
        <p className="text-brand-primary text-sm font-semibold uppercase tracking-wide">
          Messaging tools
        </p>
        <h1 className="font-Zilla-Slab text-foreground text-3xl font-bold tracking-tight">
          Message segment calculator
        </h1>
        <p className="text-muted-foreground text-sm">
          See how your text uses SMS segments and credits.
        </p>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Message</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <FormField label="Message text" htmlFor="message-segment-input">
                <Textarea
                  id="message-segment-input"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Type or paste your message…"
                  rows={5}
                  className="min-h-32 resize-y"
                />
              </FormField>
              <p className="text-muted-foreground text-sm" aria-live="polite">
                Characters typed:{" "}
                <span className="text-foreground font-semibold">
                  {result.characterCount}
                </span>
              </p>
              <FormField
                className="max-w-sm"
                label="SMS encoding"
                htmlFor="sms-encoding-choice"
              >
                <select
                  id="sms-encoding-choice"
                  value={encodingChoice}
                  onChange={(event) =>
                    setEncodingChoice(event.target.value as EncodingChoice)
                  }
                  className="border-input bg-background text-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2"
                >
                  <option value="auto">Automatic (CallCaster)</option>
                  <option value="GSM-7">GSM-7</option>
                  <option value="UCS-2">UCS-2</option>
                </select>
              </FormField>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>SMS</CardTitle>
            <p className="text-muted-foreground text-sm">
              GSM-7 or UCS-2, based on the selected encoding.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-5">
              <dl className="grid grid-cols-2 gap-3">
                <Stat label="Encoding" value={result.encoding} />
                <Stat label="Characters" value={result.characterCount} />
                <Stat label="Segments" value={result.displayedSegments} />
                <Stat
                  label="Remaining in last segment"
                  value={result.remaining}
                />
              </dl>
              {result.unsupportedForGsm ? (
                <Alert variant="warning">
                  <AlertDescription>
                    This message has characters outside GSM-7. Use Automatic or
                    UCS-2 to get a valid estimate.
                  </AlertDescription>
                </Alert>
              ) : null}
              <div className="space-y-1">
                <div className="text-muted-foreground flex items-center justify-between text-xs">
                  <span>Current segment</span>
                  <span>
                    {result.usedInCurrentSegment} of {result.segmentCapacity} units
                  </span>
                </div>
                <div
                  role="meter"
                  aria-label="Current SMS segment usage"
                  aria-valuemin={0}
                  aria-valuemax={result.segmentCapacity}
                  aria-valuenow={result.usedInCurrentSegment}
                  className="bg-muted h-2 overflow-hidden rounded-full"
                >
                  <div
                    className="w-(--segment-progress) bg-brand-primary h-full rounded-full"
                    style={
                      {
                        "--segment-progress": `${result.segmentUsagePercent}%`,
                      } as CSSProperties
                    }
                  />
                </div>
              </div>
              <dl className="border-border border-t pt-2">
                <Detail label="Message size" value={messageSize} />
                <Detail label="Units used" value={result.totalUnits} />
                <Detail
                  label="SMS credits in CallCaster"
                  value={`${result.segments * SMS_SEGMENT_CREDITS} credits`}
                />
                <Detail
                  label="Estimated value"
                  value={`$${(result.segments * SMS_SEGMENT_CREDITS * CREDIT_PRICE_CAD).toFixed(2)} CAD`}
                />
              </dl>
              <CharacterDetails characters={result.nonGsmCharacters} />
              <p className="text-muted-foreground text-xs">
                Automatic mode matches CallCaster: GSM-7 when every character
                fits, otherwise UCS-2. GSM-7 uses 160 units in one segment and
                153 per concatenated segment. UCS-2 uses 70 and 67.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
