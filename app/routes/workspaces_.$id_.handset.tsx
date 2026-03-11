import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  Link,
  useLoaderData,
  useNavigate,
  useFetcher,
} from "@remix-run/react";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env.server";
import type { Database } from "@/lib/database.types";
import { useCallback, useEffect, useRef, useState } from "react";
import { verifyAuth } from "@/lib/supabase.server";
import {
  requireWorkspaceAccess,
  getHandsetNumberForWorkspace,
} from "@/lib/database.server";
import { useTwilioConnection } from "@/hooks/call/useTwilioConnection";
import { useCallHandling } from "@/hooks/call/useCallHandling";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shared/CustomCard";
import { Phone, PhoneOff } from "lucide-react";

const SESSION_EXPIRY_MINUTES = 60;

export const action = async ({ request, params }: ActionFunctionArgs) => {
  if (request.method !== "POST") return null;
  const formData = await request.formData();
  if (formData.get("intent") !== "end_session") return null;

  const { supabaseClient: supabase, user } = await verifyAuth(request);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const workspaceId = params.id;
  if (!workspaceId) return new Response("Not found", { status: 404 });

  const serviceSupabase = createClient<Database>(
    env.SUPABASE_URL(),
    env.SUPABASE_SERVICE_KEY()
  );
  await serviceSupabase
    .from("handset_session")
    .update({ status: "ended" })
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .eq("status", "active");
  return null;
};

type LoaderData = {
  handsetNumber: string | null;
  clientIdentity: string;
  workspaceId: string;
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { supabaseClient: supabase, user } = await verifyAuth(request);
  if (!user) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const workspaceId = params.id;
  if (!workspaceId) {
    throw new Response("Workspace not found", { status: 404 });
  }

  await requireWorkspaceAccess({
    supabaseClient: supabase,
    user,
    workspaceId,
  });

  const { data: handsetData } = await getHandsetNumberForWorkspace({
    supabaseClient: supabase,
    workspaceId,
  });

  if (!handsetData?.phone_number) {
    return {
      handsetNumber: null,
      clientIdentity: "",
      workspaceId,
    } satisfies LoaderData;
  }

  const clientIdentity = `handset-${crypto.randomUUID()}`;
  const expiresAt = new Date(
    Date.now() + SESSION_EXPIRY_MINUTES * 60 * 1000
  ).toISOString();

  const { error } = await supabase.from("handset_session").insert({
    user_id: user.id,
    workspace_id: workspaceId,
    client_identity: clientIdentity,
    status: "active",
    expires_at: expiresAt,
  });

  if (error) {
    throw new Response("Failed to create handset session", { status: 500 });
  }

  return {
    handsetNumber: handsetData.phone_number,
    clientIdentity,
    workspaceId,
  } satisfies LoaderData;
};

export default function HandsetPage() {
  const { handsetNumber, clientIdentity, workspaceId } =
    useLoaderData<LoaderData>();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const sessionEndedRef = useRef(false);

  const [token, setToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientIdentity || !workspaceId) return;
    const url = `/api/handset-token?workspace=${encodeURIComponent(workspaceId)}&client_identity=${encodeURIComponent(clientIdentity)}`;
    fetch(url, { credentials: "include" })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) {
          setTokenError(data.error ?? `Request failed (${r.status})`);
          return;
        }
        if (data.token) setToken(data.token);
        else setTokenError(data.error ?? "Failed to get token");
      })
      .catch(() => setTokenError("Failed to get token"));
  }, [clientIdentity, workspaceId]);

  const endSession = useCallback(() => {
    if (sessionEndedRef.current) return;
    sessionEndedRef.current = true;
    fetcher.submit(
      { intent: "end_session" },
      { method: "POST", action: `/workspaces/${workspaceId}/handset` }
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
            <Link to={`/workspaces/${workspaceId}/settings`}>Workspace settings</Link>
          </Button>
        </Card>
      </div>
    );
  }

  if (tokenError) {
    return (
      <div className="container mx-auto max-w-md p-6">
        <Card className="p-6">
          <h1 className="text-xl font-semibold">Handset</h1>
          <p className="mt-2 text-destructive">{tokenError}</p>
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
      workspaceId={workspaceId}
      endSession={endSession}
      onError={setTokenError}
      onNavigateBack={() => navigate(`/workspaces/${workspaceId}`)}
    />
  );
}

type HandsetConnectedProps = {
  token: string;
  handsetNumber: string;
  workspaceId: string;
  endSession: () => void;
  onError: (message: string) => void;
  onNavigateBack: () => void;
};

function HandsetConnected({
  token,
  handsetNumber,
  workspaceId,
  endSession,
  onError,
  onNavigateBack,
}: HandsetConnectedProps) {
  const [incomingCallState, setIncomingCallState] = useState<unknown>(null);
  const noop = useCallback(() => {}, []);

  const connection = useTwilioConnection({
    token,
    onIncomingCall: (call) => setIncomingCallState(call),
    onStatusChange: noop,
    onError: (err) => onError(err.message),
    onDeviceBusyChange: noop,
  });

  const callHandling = useCallHandling({
    device: connection.device,
    workspaceId,
    incomingCall: incomingCallState,
    onStatusChange: noop,
    onError: (err) => onError(err.message),
    onDeviceBusyChange: noop,
  });

  const incomingCall = callHandling.incomingCall;
  const fromNumber =
    incomingCall &&
    typeof incomingCall === "object" &&
    "parameters" in incomingCall &&
    typeof (incomingCall as { parameters?: { From?: string } }).parameters?.From === "string"
      ? (incomingCall as { parameters: { From: string } }).parameters.From
      : null;

  const handleAnswer = useCallback(() => {
    callHandling.answer();
  }, [callHandling]);

  const handleDecline = useCallback(() => {
    if (
      incomingCall &&
      typeof incomingCall === "object" &&
      "reject" in incomingCall &&
      typeof (incomingCall as { reject: () => void }).reject === "function"
    ) {
      (incomingCall as { reject: () => void }).reject();
    }
  }, [incomingCall]);

  const handleEndSession = useCallback(() => {
    endSession();
    onNavigateBack();
  }, [endSession, onNavigateBack]);

  const handleKeypadPress = useCallback(
    (key: string) => {
      callHandling.activeCall?.sendDigits(key);
    },
    [callHandling.activeCall]
  );

  const keypadKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

  return (
    <div className="container mx-auto max-w-md p-6">
      <Card className="p-6">
        <h1 className="text-xl font-semibold">Handset</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Status: {connection.status}
        </p>

        <div className="mt-4 rounded-lg bg-muted p-4">
          <p className="text-sm font-medium text-muted-foreground">
            Call this number to ring here
          </p>
          <p className="mt-1 text-lg font-mono">{handsetNumber}</p>
        </div>

        {incomingCall ? (
          <div className="mt-6 rounded-lg border-2 border-primary p-4">
            <p className="font-medium">Incoming call from {fromNumber ?? "unknown"}</p>
            <div className="mt-3 flex gap-2">
              <Button onClick={handleAnswer} className="flex-1 gap-2">
                <Phone size={16} />
                Answer
              </Button>
              <Button
                onClick={handleDecline}
                variant="destructive"
                className="flex-1 gap-2"
              >
                <PhoneOff size={16} />
                Decline
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-6 text-center text-muted-foreground">
            Waiting for calls...
          </p>
        )}

        {callHandling.activeCall && (
          <div className="mt-4 rounded-lg bg-green-100 dark:bg-green-900/30 p-4">
            <p className="font-medium">Connected</p>
            <div className="mt-3 grid grid-cols-3 gap-2 max-w-[140px]">
              {keypadKeys.map((key) => (
                <Button
                  key={key}
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-9 w-9 p-0 text-base font-mono"
                  onClick={() => handleKeypadPress(key)}
                >
                  {key}
                </Button>
              ))}
            </div>
            <Button
              onClick={callHandling.hangUp}
              variant="outline"
              size="sm"
              className="mt-4"
            >
              Hang up
            </Button>
          </div>
        )}

        <Button
          variant="ghost"
          className="mt-6 w-full"
          onClick={handleEndSession}
        >
          End session and leave
        </Button>
      </Card>
    </div>
  );
}
