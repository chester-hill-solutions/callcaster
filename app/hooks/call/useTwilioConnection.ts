import { useCallback, useEffect, useRef, useState } from "react";
import type { Call, Device } from "@twilio/voice-sdk";
import { logger } from "@/lib/logger.client";
import { attachTwilioListener } from "@/lib/twilio/call-listener-utils.client";

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
  /**
   * Tear down the current Device (if any) and create a fresh one from
   * scratch. Terminal states (Error/RegistrationFailed/Unregistered) never
   * self-heal — nothing retries registration — so without this, the only
   * recovery is a full page reload. Safe to call at any time; a healthy
   * Device is simply replaced.
   */
  reconnect: () => void;
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
  const [device, setDevice] = useState<Device | null>(null);
  const [status, setStatus] = useState<string>("disconnected");
  const [error, setError] = useState<Error | null>(null);
  const tokenRef = useRef(token);
  const listenerCleanupsRef = useRef<Array<() => void>>([]);
  const unmountedRef = useRef(false);
  // Bumping this forces the setup effect to run again with deviceRef already
  // cleared, taking the "create a new device" branch instead of the
  // "update the existing device's token" branch.
  const [reconnectNonce, setReconnectNonce] = useState(0);

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

  /**
   * @effect Ensure a Twilio Voice SDK `Device` exists and carries the current
   * auth token. The Device is created ONCE for the component's lifetime;
   * subsequent token changes are applied in place via `device.updateToken()`.
   * Rebuilding on every new token string tore the phone down mid-call, because
   * the call-screen loader re-mints the JWT on every revalidation (every
   * fetcher submit: script auto-save, dial, audiodrop, queue ops).
   * @effect-deps token, deviceOptions (a token change is applied via
   * updateToken on the existing device, or triggers first-time creation;
   * callback props are read via refs so they don't retrigger setup),
   * reconnectNonce (bumped by the returned `reconnect()` — the manual
   * recovery path for terminal Error/RegistrationFailed/Unregistered states,
   * which nothing retries automatically)
   * @effect-side-effects subscription (Twilio Device event listeners) + network
   * (lazy SDK import, device.register()/updateToken()); teardown lives in the
   * separate unmount-only effect below, NOT in this effect's cleanup — pairing
   * teardown with this effect is exactly what caused the rebuild storm.
   * @effect-why-not-loader Establishes a stateful, imperative WebRTC device
   * registration with the Twilio SDK that must persist for the component's
   * lifetime; it isn't a request/response data fetch.
   */
  useEffect(() => {
    tokenRef.current = token;
    if (!token) {
      logger.error("No token provided");
      setError(new Error("No token provided"));
      onErrorRef.current?.(new Error("No token provided"));
      return;
    }

    if (typeof window === "undefined") return;

    const existing = deviceRef.current;
    if (existing) {
      try {
        existing.updateToken(token);
      } catch (err) {
        logger.error("Failed to update Twilio device token:", err);
      }
      return;
    }

    const setupDevice = async () => {
      // Load the Twilio Voice SDK lazily so it isn't bundled into routes
      // that merely render call UI but never actually connect a call.
      const { Device: TwilioDevice } = await import("@twilio/voice-sdk");
      if (unmountedRef.current || deviceRef.current) return;

      const device = new TwilioDevice(tokenRef.current, deviceOptions ?? undefined);
      deviceRef.current = device;
      setDevice(device);

      const handleRegistered = () => {
        setStatus("Registered");
        // Registering successfully means any prior error no longer applies —
        // error was set-only before this, so a single transient failure left
        // a stale "Phone connection error" banner up for the rest of the
        // shift even after the device recovered.
        setError(null);
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
        device?.disconnectAll();
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

      listenerCleanupsRef.current = [
        attachTwilioListener(device, "registered", handleRegistered),
        attachTwilioListener(device, "unregistered", handleUnregistered),
        attachTwilioListener(device, "connecting", handleConnecting),
        attachTwilioListener(device, "connected", handleConnected),
        attachTwilioListener(device, "disconnected", handleDisconnected),
        attachTwilioListener(device, "cancel", handleCancel),
        attachTwilioListener(device, "error", handleError),
        attachTwilioListener(device, "incoming", handleIncoming),
      ];

      device.register().catch((err: unknown) => {
        // Twilio's Voice SDK can reject register() with `undefined` (not an
        // Error) for signaling-level auth failures — the real error is
        // delivered separately via the device "error" event. The
        // `(err: Error)` annotation this replaced was a lie: at runtime
        // `err` could be undefined, and passing it straight through crashed
        // downstream `err.message` accesses (see useSoftphoneController.ts).
        const error =
          err instanceof Error ? err : new Error("Twilio device registration failed");
        logger.error("Failed to register device:", error);
        setError(error);
        setStatus("RegistrationFailed");
        onErrorRef.current?.(error);
        onCallStateChangeRef.current?.("failed");
      });
    };

    setupDevice().catch((err: unknown) => {
      if (unmountedRef.current) return;
      const error =
        err instanceof Error ? err : new Error("Failed to load Twilio Voice SDK");
      logger.error("Failed to load Twilio Voice SDK:", error);
      setError(error);
      setStatus("Error");
      onErrorRef.current?.(error);
      onCallStateChangeRef.current?.("failed");
    });
  }, [token, deviceOptions, reconnectNonce]);

  const reconnect = useCallback(() => {
    const stale = deviceRef.current;
    deviceRef.current = null;
    listenerCleanupsRef.current.forEach((cleanup) => cleanup());
    listenerCleanupsRef.current = [];
    setDevice(null);
    setError(null);
    setStatus("disconnected");
    if (stale) {
      try {
        stale.destroy();
      } catch (err) {
        logger.error("Error destroying Twilio device during reconnect:", err);
      }
    }
    setReconnectNonce((n) => n + 1);
  }, []);

  /**
   * @effect Tear the Device down on unmount only: detach listeners and
   * `destroy()` it. destroy() (not just unregister()) closes the signalling
   * socket — the old unregister-only teardown leaked one socket per rebuild
   * over a shift.
   * @effect-deps [] — mount-once, cleanup-only; reads live values via refs.
   * @effect-side-effects subscription cleanup + network (device.destroy()).
   * @effect-why-not-loader Imperative SDK teardown tied to component unmount.
   */
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      listenerCleanupsRef.current.forEach((cleanup) => cleanup());
      listenerCleanupsRef.current = [];
      const device = deviceRef.current;
      deviceRef.current = null;
      if (device) {
        try {
          device.destroy();
        } catch (err) {
          logger.error("Error destroying Twilio device:", err);
        }
      }
    };
  }, []);

  return {
    device,
    status,
    error,
    isRegistered: status === "Registered" || status === "Connected",
    reconnect,
  };
}
