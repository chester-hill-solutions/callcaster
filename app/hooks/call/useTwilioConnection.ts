import { useEffect, useRef, useState } from "react";
import type { Call, Device } from "@twilio/voice-sdk";
import { Device as TwilioDevice } from "@twilio/voice-sdk";
import { logger } from "@/lib/logger.client";
import { attachTwilioListener } from "@/lib/twilio/call-listener-utils.client";

const getTwilioSDK = () => {
  if (typeof window === "undefined") return null;
  return { Device: TwilioDevice };
};

export type DeviceOptions = {
  allowIncomingWhileBusy?: boolean;
  [key: string]: unknown;
};

interface UseTwilioConnectionOptions {
  token: string;
  deviceOptions?: DeviceOptions;
  onIncomingCall?: (call: Call) => void;
  onStatusChange?: (status: string) => void;
  onError?: (error: Error) => void;
  onCallStateChange?: (callState: string) => void;
  onDeviceBusyChange?: (isBusy: boolean) => void;
}

interface UseTwilioConnectionReturn {
  device: Device | null;
  status: string;
  error: Error | null;
  isRegistered: boolean;
}

/**
 * Hook for managing Twilio device connection and registration.
 */
export function useTwilioConnection({
  token,
  deviceOptions,
  onIncomingCall,
  onStatusChange,
  onError,
  onCallStateChange,
  onDeviceBusyChange,
}: UseTwilioConnectionOptions): UseTwilioConnectionReturn {
  const deviceRef = useRef<Device | null>(null);
  const [status, setStatus] = useState<string>("disconnected");
  const [error, setError] = useState<Error | null>(null);

  const onIncomingCallRef = useRef(onIncomingCall);
  const onStatusChangeRef = useRef(onStatusChange);
  const onErrorRef = useRef(onError);
  const onCallStateChangeRef = useRef(onCallStateChange);
  const onDeviceBusyChangeRef = useRef(onDeviceBusyChange);
  onIncomingCallRef.current = onIncomingCall;
  onStatusChangeRef.current = onStatusChange;
  onErrorRef.current = onError;
  onCallStateChangeRef.current = onCallStateChange;
  onDeviceBusyChangeRef.current = onDeviceBusyChange;

  useEffect(() => {
    if (!token) {
      logger.error("No token provided");
      setError(new Error("No token provided"));
      onErrorRef.current?.(new Error("No token provided"));
      return;
    }

    if (typeof window === "undefined") return;

    const SDK = getTwilioSDK();
    if (!SDK) return;

    const device = new SDK.Device(token, deviceOptions ?? undefined);
    deviceRef.current = device;

    const handleRegistered = () => {
      setStatus("Registered");
      onStatusChangeRef.current?.("Registered");
      onDeviceBusyChangeRef.current?.(false);
    };

    const handleUnregistered = () => {
      setStatus("Unregistered");
      onStatusChangeRef.current?.("Unregistered");
    };

    const handleConnecting = () => {
      setStatus("Connecting");
      onStatusChangeRef.current?.("Connecting");
    };

    const handleConnected = () => {
      setStatus("Connected");
      onStatusChangeRef.current?.("Connected");
      onCallStateChangeRef.current?.("connected");
    };

    const handleDisconnected = () => {
      setStatus("Disconnected");
      onDeviceBusyChangeRef.current?.(false);
      logger.debug("Call ended");
      device.disconnectAll();
    };

    const handleCancel = () => {
      setStatus("Cancelled");
      onStatusChangeRef.current?.("Cancelled");
      onDeviceBusyChangeRef.current?.(false);
    };

    const handleError = (err: unknown) => {
      const error = err instanceof Error ? err : new Error("Twilio device error");
      logger.error("Twilio Device Error:", error);
      onDeviceBusyChangeRef.current?.(false);
      setStatus("Error");
      setError(error);
      onErrorRef.current?.(error);
      onCallStateChangeRef.current?.("failed");
    };

    const handleIncoming = (call: unknown) => {
      onIncomingCallRef.current?.(call as Call);
    };

    const listenerCleanups = [
      attachTwilioListener(device, "registered", handleRegistered),
      attachTwilioListener(device, "unregistered", handleUnregistered),
      attachTwilioListener(device, "connecting", handleConnecting),
      attachTwilioListener(device, "connected", handleConnected),
      attachTwilioListener(device, "disconnected", handleDisconnected),
      attachTwilioListener(device, "cancel", handleCancel),
      attachTwilioListener(device, "error", handleError),
      attachTwilioListener(device, "incoming", handleIncoming),
    ];

    device.register().catch((err: Error) => {
      logger.error("Failed to register device:", err);
      setError(err);
      setStatus("RegistrationFailed");
      onErrorRef.current?.(err);
      onCallStateChangeRef.current?.("failed");
    });

    return () => {
      if (device.state === "registered") {
        device.unregister().catch((err: Error) =>
          logger.error("Error unregistering device:", err),
        );
      }
      listenerCleanups.forEach((cleanup) => cleanup());
      deviceRef.current = null;
    };
  }, [token, deviceOptions]);

  return {
    device: deviceRef.current,
    status,
    error,
    isRegistered: status === "Registered" || status === "Connected",
  };
}
