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
  /**
   * Called when the Twilio SDK signals that the current access token is about
   * to expire. The caller should fetch a fresh token (e.g. via route
   * revalidation) so the existing `updateToken()` flow picks it up before the
   * signaling WebSocket is closed.
   */
  onTokenWillExpire?: () => void;
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
  onTokenWillExpire,
}: UseTwilioConnectionOptions): UseTwilioConnectionReturn {
  const deviceRef = useRef<Device | null>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const [status, setStatus] = useState<string>("disconnected");
  const [error, setError] = useState<Error | null>(null);
  const tokenRef = useRef(token);
  const listenerCleanupsRef = useRef<Array<() => void>>([]);
  const unmountedRef = useRef(false);
  const isReconnectingRef = useRef(false);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTokenWillExpireRef = useRef(onTokenWillExpire);
  onTokenWillExpireRef.current = onTokenWillExpire;
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
        setError(null);
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

      // Emit tokenWillExpire 5 minutes before the token's TTL elapses, giving
      // the caller plenty of time to fetch a fresh token via onTokenWillExpire.
      const mergedOptions: DeviceOptions = {
        ...deviceOptions,
        tokenRefreshMs: 300000,
      };
      const device = new TwilioDevice(tokenRef.current, mergedOptions);
      deviceRef.current = device;
      setDevice(device);

      const handleRegistered = () => {
        isReconnectingRef.current = false;
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
        retryCountRef.current = 0;
        setStatus("Registered");
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
        setError(null);
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

      const scheduleRetry = (reason: string) => {
        if (unmountedRef.current) return;
        const retries = retryCountRef.current;
        const BASE_DELAY_MS = 2000;
        const MAX_DELAY_MS = 60000;
        const delay = Math.min(BASE_DELAY_MS * 2 ** retries, MAX_DELAY_MS);
        logger.info(`Scheduling device reconnect (${reason}) in ${delay}ms`, { retry: retries + 1 });
        retryCountRef.current = retries + 1;
        retryTimerRef.current = setTimeout(() => {
          if (!unmountedRef.current) reconnectRef.current();
        }, delay);
      };

      const handleError = (err: unknown) => {
        const error = err instanceof Error ? err : new Error("Twilio device error");
        const code = (err as { code?: number })?.code;

        // TransportError (code 31009) means the signaling WebSocket is closed
        // and no messages can be sent. This happens when the transport was
        // never opened, was disconnected (e.g. token expiry, network blip), or
        // the heartbeat timed out. Auto-recover by recreating the Device from
        // scratch instead of leaving it stuck in Error state until the user
        // manually clicks "Reconnect phone".
        if (code === 31009 && !isReconnectingRef.current) {
          isReconnectingRef.current = true;
          logger.info("TransportError (31009) detected, auto-reconnecting device");
          reconnectRef.current();
          return;
        }

        logger.error("Twilio Device Error:", error);
        onDeviceBusyChangeRef.current?.(false);
        setStatus("Error");
        setError(error);
        onErrorRef.current?.(error);
        onCallStateChangeRef.current?.("failed");
        scheduleRetry("device error");
      };

      const handleIncoming = (call: unknown) => {
        onIncomingCallRef.current?.(call as Call);
      };

      const handleTokenWillExpire = () => {
        logger.info("Twilio token about to expire, requesting refresh");
        onTokenWillExpireRef.current?.();
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
        attachTwilioListener(device, "tokenWillExpire", handleTokenWillExpire),
      ];

      device.register().catch((err: unknown) => {
        const error =
          err instanceof Error ? err : new Error("Twilio device registration failed");
        logger.error("Failed to register device:", error);
        setError(error);
        setStatus("RegistrationFailed");
        onErrorRef.current?.(error);
        onCallStateChangeRef.current?.("failed");
        scheduleRetry("registration failed");
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
    isReconnectingRef.current = true;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
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
  const reconnectRef = useRef(reconnect);
  reconnectRef.current = reconnect;

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
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
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
