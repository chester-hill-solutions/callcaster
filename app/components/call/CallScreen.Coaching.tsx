import { Button } from "@/components/ui/button";
import type {
  CoachingCueView,
  CoachingMetricsView,
  CoachingSessionView,
} from "@/hooks/call/useCallCoaching";

export function CallScreenCoaching({
  metrics,
  cues,
  session,
  onAcknowledgeCue,
}: {
  metrics: CoachingMetricsView | null;
  cues: CoachingCueView[];
  session: CoachingSessionView | null;
  onAcknowledgeCue: (eventId: string) => void;
}) {
  const wpmColor = !metrics
    ? "text-muted-foreground"
    : metrics.wpm < 120
      ? "text-blue-500"
      : metrics.wpm > 160
        ? "text-red-500"
        : "text-green-500";

  return (
    <div className="flex h-64 flex-col space-y-3 overflow-hidden p-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className={`text-2xl font-bold ${wpmColor}`}>{metrics?.wpm ?? "—"}</div>
          <div className="text-xs text-muted-foreground">WPM</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-foreground">{metrics?.fillerCount ?? "—"}</div>
          <div className="text-xs text-muted-foreground">Fillers</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-foreground">{metrics?.pauseCount ?? "—"}</div>
          <div className="text-xs text-muted-foreground">Pauses</div>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto">
        {cues.length === 0 && !session ? (
          <p className="text-center text-sm text-muted-foreground">
            Coaching cues appear during the call.
          </p>
        ) : null}
        {cues.map((cue) => (
          <div
            key={cue.eventId}
            className={`rounded-lg border p-3 text-sm ${
              cue.acknowledgedAt ? "opacity-60" : "border-brand-secondary/40"
            }`}
          >
            <div className="font-semibold">{cue.heading}</div>
            <p className="mt-1 text-muted-foreground">{cue.suggestion}</p>
            {!cue.acknowledgedAt ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => onAcknowledgeCue(cue.eventId)}
              >
                Got it
              </Button>
            ) : null}
          </div>
        ))}
        {session ? (
          <div className="rounded-lg border border-brand-secondary/40 bg-muted/40 p-3 text-sm">
            <div className="font-semibold">Session score: {session.score}</div>
            <p className="mt-1 text-muted-foreground">{session.summary}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
