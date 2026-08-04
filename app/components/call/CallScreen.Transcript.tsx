import type { ReactNode } from "react";
import type { TranscriptSegmentView } from "@/hooks/call/useCallCoaching";

const FILLER_PATTERN = /\b(uh|um|like|you know|basically|actually)\b/gi;

function highlightFillers(text: string, fillerCount: number): ReactNode {
  if (fillerCount === 0) return text;

  const parts = text.split(FILLER_PATTERN);
  return parts.map((part, index) => {
    const isFiller = /^(uh|um|like|you know|basically|actually)$/i.test(part);
    return isFiller ? (
      <mark key={index} className="rounded bg-yellow-200/60 px-0.5">
        {part}
      </mark>
    ) : (
      part
    );
  });
}

export function CallScreenTranscript({ segments }: { segments: TranscriptSegmentView[] }) {
  return (
    <div className="flex h-64 flex-col overflow-hidden">
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {segments.length === 0 ? (
          <p className="pt-8 text-center text-sm text-muted-foreground">
            Transcript will appear here when the call connects.
          </p>
        ) : null}
        {segments.map((seg) => (
          <div
            key={seg.id}
            className={`text-sm leading-relaxed ${
              seg.speakerLabel === "agent" ? "text-brand-primary" : "text-foreground"
            }`}
          >
            <span className="mr-2 text-xs font-semibold uppercase">{seg.speakerLabel}</span>
            <span>{highlightFillers(seg.text, seg.fillerCount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
