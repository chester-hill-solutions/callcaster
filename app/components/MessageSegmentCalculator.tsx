import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { getSmsSegmentInfo } from "@/lib/sms-segments";
import { CREDIT_PRICE_CAD, SMS_SEGMENT_CREDITS } from "@/lib/pricing";

type EncodingChoice = "auto" | "GSM-7" | "UCS-2";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-background px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2 last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

export function MessageSegmentCalculator() {
  const [message, setMessage] = useState("");
  const [encodingChoice, setEncodingChoice] = useState<EncodingChoice>("auto");

  const result = useMemo(() => {
    const automatic = getSmsSegmentInfo(message);
    const encoding = encodingChoice === "auto" ? automatic.encoding : encodingChoice;
    const totalUnits = encoding === "GSM-7" ? automatic.totalUnits : message.length;
    const unsupportedForGsm = encoding === "GSM-7" && automatic.encoding !== "GSM-7";
    const singleLimit = encoding === "GSM-7" ? 160 : 70;
    const multiLimit = encoding === "GSM-7" ? 153 : 67;
    const segmentCapacity = totalUnits > singleLimit ? multiLimit : singleLimit;
    const segments = totalUnits === 0 ? 0 : Math.ceil(totalUnits / segmentCapacity);
    const displayedSegments = Math.max(1, segments);
    const remaining = totalUnits === 0
      ? singleLimit
      : segmentCapacity - (totalUnits - (segments - 1) * segmentCapacity);
    const nonGsmCharacters = Array.from(new Set(Array.from(message).filter((character) =>
      getSmsSegmentInfo(character).encoding !== "GSM-7",
    )));
    return {
      encoding,
      totalUnits,
      segments,
      displayedSegments,
      segmentCapacity,
      remaining,
      unsupportedForGsm,
      nonGsmCharacters,
      characterCount: Array.from(message).length,
    };
  }, [encodingChoice, message]);

  const messageSize = result.encoding === "GSM-7"
    ? `${result.totalUnits * 7} bits`
    : `${result.totalUnits * 16} bits`;
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-5 space-y-1.5">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-primary">Messaging tools</p>
        <h1 className="font-Zilla-Slab text-3xl font-bold tracking-tight text-foreground">Message segment calculator</h1>
        <p className="text-sm text-muted-foreground">See how your text uses SMS segments and credits.</p>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3"><CardTitle>Message</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <label className="sr-only" htmlFor="message-segment-input">Message text</label>
            <Textarea
              id="message-segment-input"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Type or paste your message…"
              rows={5}
              className="min-h-32 resize-y text-base"
            />
            <p className="text-sm text-muted-foreground" aria-live="polite">
              Characters typed: <span className="font-semibold text-foreground">{result.characterCount}</span>
            </p>
            <label className="block max-w-sm space-y-1.5 text-sm font-medium" htmlFor="sms-encoding-choice">
              SMS encoding
              <select
                id="sms-encoding-choice"
                value={encodingChoice}
                onChange={(event) => setEncodingChoice(event.target.value as EncodingChoice)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="auto">Automatic (CallCaster)</option>
                <option value="GSM-7">GSM-7</option>
                <option value="UCS-2">UCS-2</option>
              </select>
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>SMS</CardTitle>
            <p className="text-sm text-muted-foreground">GSM-7 or UCS-2, based on the selected encoding.</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <dl className="grid grid-cols-2 gap-3">
              <Stat label="Encoding" value={result.encoding} />
              <Stat label="Characters" value={result.characterCount} />
              <Stat label="Segments" value={result.displayedSegments} />
              <Stat label="Remaining in last segment" value={result.remaining} />
            </dl>
            {result.unsupportedForGsm ? (
              <p className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
                This message has characters outside GSM-7. Use Automatic or UCS-2 to get a valid estimate.
              </p>
            ) : null}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Current segment</span><span>{result.totalUnits} of {result.segmentCapacity} units</span>
              </div>
              <div
                role="meter"
                aria-label="Current SMS segment usage"
                aria-valuemin={0}
                aria-valuemax={result.segmentCapacity}
                aria-valuenow={Math.min(result.totalUnits === 0 ? 0 : result.totalUnits % result.segmentCapacity || result.segmentCapacity, result.segmentCapacity)}
                className="h-2 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-brand-primary transition-[width]"
                  style={{ width: `${Math.min(100, ((result.totalUnits === 0 ? 0 : result.totalUnits % result.segmentCapacity || result.segmentCapacity) / result.segmentCapacity) * 100)}%` }}
                />
              </div>
            </div>
            <dl className="border-t border-border pt-2">
              <Detail label="Message size" value={messageSize} />
              <Detail label="Units used" value={result.totalUnits} />
              <Detail label="SMS credits in CallCaster" value={`${result.segments * SMS_SEGMENT_CREDITS} credits`} />
              <Detail label="Estimated value" value={`$${(result.segments * SMS_SEGMENT_CREDITS * CREDIT_PRICE_CAD).toFixed(2)} CAD`} />
            </dl>
            <details className="rounded-md border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">Character detail</summary>
              {result.nonGsmCharacters.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No characters outside GSM-7 were found.</p>
              ) : (
                <ul className="mt-2 divide-y divide-border">
                  {result.nonGsmCharacters.map((character) => (
                    <li key={character} className="flex justify-between gap-3 py-2 text-sm">
                      <span className="font-mono">{character === " " ? "space" : character}</span>
                      <code className="text-muted-foreground">U+{character.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0")}</code>
                    </li>
                  ))}
                </ul>
              )}
            </details>
            <p className="text-xs text-muted-foreground">
              Automatic mode matches CallCaster: GSM-7 when every character fits, otherwise UCS-2. GSM-7 uses 160 units in one segment and 153 per concatenated segment. UCS-2 uses 70 and 67.
            </p>
          </CardContent>
        </Card>

      </div>
    </main>
  );
}
