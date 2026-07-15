import { CallScreenCoaching } from "@/components/call/CallScreen.Coaching";
import { CallScreenTranscript } from "@/components/call/CallScreen.Transcript";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCallCoaching } from "@/hooks/call/useCallCoaching";
import { liveMediaCapabilities } from "@/lib/live-media-capabilities";
import type { CallCoachingHydration } from "@/hooks/call/useCallCoaching";
import type { WorkspaceFeatureFlags } from "@/lib/coaching-schemas";

export function CallScreenLiveCoachingPanels({
  workspaceId,
  callSid,
  featureFlags,
  initialCoaching,
}: {
  workspaceId: string;
  callSid: string | null;
  featureFlags: WorkspaceFeatureFlags | Record<string, unknown> | null | undefined;
  /** Loader-supplied state for a call that was already running at mount. */
  initialCoaching?: CallCoachingHydration | null;
}) {
  const { showTranscript, showCoaching } = liveMediaCapabilities(featureFlags);
  // Called unconditionally (rules of hooks); the hook itself skips the
  // EventSource when nothing here would render.
  const coaching = useCallCoaching(
    workspaceId,
    callSid,
    showTranscript || showCoaching,
    initialCoaching,
  );

  if (!showTranscript && !showCoaching) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">
          {showCoaching ? "Live coaching" : "Live transcript"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={showTranscript ? "transcript" : "coaching"}>
          <TabsList>
            {showTranscript ? (
              <TabsTrigger value="transcript">Transcript</TabsTrigger>
            ) : null}
            {showCoaching ? (
              <TabsTrigger value="coaching">Coaching</TabsTrigger>
            ) : null}
          </TabsList>
          {showTranscript ? (
            <TabsContent value="transcript">
              <CallScreenTranscript segments={coaching.segments} />
            </TabsContent>
          ) : null}
          {showCoaching ? (
            <TabsContent value="coaching">
              <CallScreenCoaching
                metrics={coaching.metrics}
                cues={coaching.cues}
                session={coaching.session}
                onAcknowledgeCue={(eventId) => void coaching.acknowledgeCue(eventId)}
              />
            </TabsContent>
          ) : null}
        </Tabs>
      </CardContent>
    </Card>
  );
}
