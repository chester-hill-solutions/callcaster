import { Link, useLoaderData, useNavigate, useFetcher } from "react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { BrandedCard as Card } from "@/components/shared/BrandedCard";
import { SoftphonePanel } from "@/components/calls/SoftphonePanel";
import type { HandsetLoaderData } from "@/lib/handset/handset-session.server";
import { useSoftphoneController } from "@/hooks/call/useSoftphoneController";
import { useSoftphoneAudioDevices } from "@/hooks/call/useSoftphoneAudioDevices";

export default function HandsetCallPanel() {
  const { handsetNumber, clientIdentity, workspaceId, token, tokenError } =
    useLoaderData<HandsetLoaderData>();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const sessionEndedRef = useRef(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  const endSession = useCallback(() => {
    if (sessionEndedRef.current) return;
    sessionEndedRef.current = true;
    fetcher.submit(
      { intent: "end_session" },
      { method: "POST", action: `/workspaces/${workspaceId}/handset` },
    );
  }, [fetcher, workspaceId]);

  useEffect(() => {
    return () => {
      endSession();
    };
  }, [endSession]);

  if (!handsetNumber) {
    return (
      <div className="container mx-auto max-w-md p-6">
        <Card className="p-6">
          <h1 className="text-xl font-semibold">Handset</h1>
          <p className="mt-2 text-muted-foreground">
            No phone number is set up for this workspace. Add a number in
            workspace settings and enable handset mode to receive calls here.
          </p>
          <Button asChild className="mt-4">
            <Link to={`/workspaces/${workspaceId}/settings`}>
              Workspace settings
            </Link>
          </Button>
        </Card>
      </div>
    );
  }

  if (tokenError || runtimeError) {
    return (
      <div className="container mx-auto max-w-md p-6">
        <Card className="p-6">
          <h1 className="text-xl font-semibold">Handset</h1>
          <p className="mt-2 text-destructive">{tokenError ?? runtimeError}</p>
          <Button asChild variant="outline" className="mt-4">
            <Link to={`/workspaces/${workspaceId}`}>Back to workspace</Link>
          </Button>
        </Card>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="container mx-auto max-w-md p-6">
        <Card className="p-6">
          <h1 className="text-xl font-semibold">Handset</h1>
          <p className="mt-2 text-muted-foreground">Connecting...</p>
        </Card>
      </div>
    );
  }

  return (
    <HandsetConnected
      token={token}
      handsetNumber={handsetNumber}
      clientIdentity={clientIdentity}
      workspaceId={workspaceId}
      endSession={endSession}
      onError={setRuntimeError}
      onNavigateBack={() => navigate(`/workspaces/${workspaceId}`)}
    />
  );
}

type HandsetConnectedProps = {
  token: string;
  handsetNumber: string;
  clientIdentity: string;
  workspaceId: string;
  endSession: () => void;
  onError: (message: string) => void;
  onNavigateBack: () => void;
};

function HandsetConnected({
  token,
  handsetNumber,
  clientIdentity,
  workspaceId,
  endSession,
  onError,
  onNavigateBack,
}: HandsetConnectedProps) {
  const controller = useSoftphoneController({
    token,
    workspaceId,
    clientIdentity,
    endSession,
    onNavigateBack,
    onError,
  });

  const audio = useSoftphoneAudioDevices({
    device: controller.connection.device,
    activeCall: controller.callHandling.activeCall,
    micCoordinator: {
      isMicMuted: controller.callHandling.isMicMuted,
      setMicMuted: controller.callHandling.setMicMuted,
    },
  });

  return (
    <SoftphonePanel
      title="Handset"
      handsetNumber={handsetNumber}
      handsetNumberLabel="Call this number to ring here"
      idPrefix="handset"
      controller={controller}
      audio={audio}
      connectionStatus={controller.connection.status}
      onEndSession={controller.handleEndSession}
    />
  );
}
