import { useCallback, useEffect, useRef, useState } from "react";
import type { Call, Device } from "@twilio/voice-sdk";
import { logger } from "@/lib/logger.client";
import { attachTwilioListener } from "@/lib/twilio/call-listener-utils.client";
import { destroyTwilioDevice } from "@/lib/twilio/device-teardown.client";

export type DeviceOptions = {
  allowIncomingWhileBusy?: boolean;
  [key: string]: unknown;
};

function hasLiveCalls(device: Device | null, ownedCalls: readonly (Call | null)[] = []) {
  return [...(device?.calls ?? []), ...ownedCalls].some((call) => call && call.status?.() !== "closed");
}

interface UseTwilioConnectionOptions {
  token: string;
  /**
   * Gate browser registration behind Join and the effective audio transport.
   * Disabling releases an idle Device and cancels pending setup. An unretired
   * active or held call keeps its Device until its owner finishes the handoff.
   */
  enabled?: boolean;
  deviceOptions?: DeviceOptions;
  onIncomingCall?: (call: Call) => void;
  getOwnedCalls?: () => readonly (Call | null)[];
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
  releaseIdleDevice: () => void;
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
  enabled = true,
  deviceOptions,
  onIncomingCall,
  getOwnedCalls,
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
  const teardownFailedRef = useRef(false);
  const getOwnedCallsRef = useRef(getOwnedCalls);
  getOwnedCallsRef.current = getOwnedCalls;
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setupGenerationRef = useRef(0);
  const registrationEnabledRef = useRef(enabled);
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

  const teardownDevice = useCallback((device: Device | null) => {
    const cleanups = listenerCleanupsRef.current;
    listenerCleanupsRef.current = [];
    for (const cleanup of cleanups) {
      try { cleanup(); } catch (error) { logger.error("Twilio listener cleanup failed:", error); }
    }
    if (!device) return true;
    const result = destroyTwilioDevice(device, getOwnedCallsRef.current?.() ?? []);
    for (const error of result.errors) logger.error("Twilio device cleanup failed:", error);
    return result.destroyed && result.errors.length === 0;
  }, []);

  const suspendIdleDevice = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    const current = deviceRef.current;
    if (hasLiveCalls(current, getOwnedCallsRef.current?.())) return;
    isReconnectingRef.current = false;
    deviceRef.current = null;
    teardownFailedRef.current = !teardownDevice(current);
    if (teardownFailedRef.current) {
      deviceRef.current = current;
      const error = new Error("Phone cleanup did not finish. Try reconnecting again.");
      setError(error);
      setStatus("Error");
      onErrorRef.current?.(error);
      return;
    }
    setDevice(null);
    setStatus("disconnected");
    setError(null);
    onStatusChangeRef.current?.("disconnected");
  }, [teardownDevice]);

  /**
   * @effect Ensure a Twilio Voice SDK `Device` exists and carries the current
   * auth token. The Device is created ONCE for the component's lifetime;
   * subsequent token changes are applied in place via `device.updateToken()`.
   * Rebuilding on every new token string tore the phone down mid-call, because
   * the call-screen loader re-mints the JWT on every revalidation (every
   * fetcher submit: script auto-save, dial, audiodrop, queue ops).
   * @effect-deps token, enabled (gates creation, cancels pending setup and
   * suspends an idle browser transport), suspendIdleDevice (stable resource
   * release), deviceOptions (a token change is
   * applied via updateToken on the existing device, or triggers first-time
   * creation; callback props are read via refs so they don't retrigger
   * setup), reconnectNonce (bumped by the returned `reconnect()` — the
   * manual recovery path for terminal Error/RegistrationFailed/Unregistered
   * states, which nothing retries automatically)
   * @effect-side-effects subscription (Twilio Device event listeners) + network
   * (lazy SDK import, device.register()/updateToken()). Teardown is explicit on
   * suspension or unmount, never on token-effect cleanup.
   * @effect-why-not-loader Establishes a stateful, imperative WebRTC device
   * registration with the Twilio SDK that must persist for the component's
   * lifetime; it isn't a request/response data fetch.
   */
  useEffect(() => {
    const generation = ++setupGenerationRef.current;
    registrationEnabledRef.current = enabled;
    if (!enabled) {
      suspendIdleDevice();
      // A live leg can outlast a requested suspension. Keep its token current
      // until the call owner retires it; no replacement registration is allowed.
      if (!deviceRef.current || teardownFailedRef.current) return;
    }
    if (teardownFailedRef.current) return;
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
      if (setupGenerationRef.current !== generation || unmountedRef.current || teardownFailedRef.current || deviceRef.current) return;

      // Emit tokenWillExpire 5 minutes before the token's TTL elapses, giving
      // the caller plenty of time to fetch a fresh token via onTokenWillExpire.
      const mergedOptions: DeviceOptions = {
        ...deviceOptions,
        tokenRefreshMs: 300000,
      };
      const device = new TwilioDevice(tokenRef.current, mergedOptions);
      deviceRef.current = device;
      setDevice(device);

      const isCurrentDevice = () => !unmountedRef.current && !teardownFailedRef.current && deviceRef.current === device;
      const handleRegistered = () => {
        if (!isCurrentDevice()) return;
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
        if (!isCurrentDevice()) return;
        setStatus("Unregistered");
        onStatusChangeRef.current?.("Unregistered");
      };

      const handleConnecting = () => {
        if (!isCurrentDevice()) return;
        setStatus("Connecting");
        onStatusChangeRef.current?.("Connecting");
      };

      const handleConnected = () => {
        if (!isCurrentDevice()) return;
        setStatus("Connected");
        setError(null);
        onStatusChangeRef.current?.("Connected");
        onCallStateChangeRef.current?.("connected");
      };

      const handleDisconnected = () => {
        if (!isCurrentDevice()) return;
        setStatus("Disconnected");
        onDeviceBusyChangeRef.current?.(false);
        logger.debug("Call ended");
        device?.disconnectAll();
      };

      const handleCancel = () => {
        if (!isCurrentDevice()) return;
        setStatus("Cancelled");
        onStatusChangeRef.current?.("Cancelled");
        onDeviceBusyChangeRef.current?.(false);
      };

      const scheduleRetry = (reason: string, fixedDelayMs?: number) => {
        if (!isCurrentDevice() || !registrationEnabledRef.current) return;
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        const retries = retryCountRef.current;
        const BASE_DELAY_MS = 2000;
        const MAX_DELAY_MS = 60000;
        const delay = fixedDelayMs ?? Math.min(BASE_DELAY_MS * 2 ** retries, MAX_DELAY_MS);
        logger.info(`Scheduling device reconnect (${reason}) in ${delay}ms`, { retry: retries + 1 });
        retryCountRef.current = retries + 1;
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          if (!isCurrentDevice() || !registrationEnabledRef.current) return;
          // Rebuilding the device destroys its calls. If the agent is mid-call
          // when the timer fires, killing the call to fix the phone is worse
          // than waiting — defer until the call ends (#1294/31206 storm: the
          // 2s retry after a signaling error tore down a LIVE call).
          if (hasLiveCalls(device, getOwnedCallsRef.current?.())) {
            logger.info("Deferring device reconnect: call in progress");
            scheduleRetry(`${reason} (deferred: call in progress)`, delay);
            return;
          }
          reconnectRef.current();
        }, delay);
      };

      const handleError = (err: unknown) => {
        if (!isCurrentDevice()) return;
        const error = err instanceof Error ? err : new Error("Twilio device error");
        const code = (err as { code?: number })?.code;

        // TransportError (code 31009) means the signaling WebSocket is closed
        // and no messages can be sent. This happens when the transport was
        // never opened, was disconnected (e.g. token expiry, network blip), or
        // the heartbeat timed out. Auto-recover by recreating the Device from
        // scratch instead of leaving it stuck in Error state until the user
        // manually clicks "Reconnect phone" — unless a call is live: the
        // rebuild destroys the call, so mid-call recovery waits for hangup.
        if (code === 31009 && !isReconnectingRef.current) {
          if (hasLiveCalls(device, getOwnedCallsRef.current?.())) {
            logger.info("TransportError (31009) mid-call; deferring device rebuild");
            scheduleRetry("transport error (deferred: call in progress)");
            return;
          }
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

        // RateExceededError (31206): Twilio is telling us we sent too much —
        // the ICE-restart/re-invite loop of a failing call can trip this all
        // by itself. Retrying on the normal 2s backoff walks straight back
        // into the limit and (worse) the retry used to destroy the live call
        // it fired under (#1294). Cool down hard instead.
        const RATE_LIMIT_COOLDOWN_MS = 60000;
        if (code === 31206) {
          scheduleRetry("rate limited (31206 cooldown)", RATE_LIMIT_COOLDOWN_MS);
          return;
        }
        scheduleRetry("device error");
      };

      const handleIncoming = (call: unknown) => {
        if (!isCurrentDevice() || !registrationEnabledRef.current) return;
        onIncomingCallRef.current?.(call as Call);
      };

      const handleTokenWillExpire = () => {
        if (!isCurrentDevice()) return;
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
        if (!isCurrentDevice() || !registrationEnabledRef.current) return;
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
      if (setupGenerationRef.current !== generation || unmountedRef.current) return;
      const error =
        err instanceof Error ? err : new Error("Failed to load Twilio Voice SDK");
      logger.error("Failed to load Twilio Voice SDK:", error);
      setError(error);
      setStatus("Error");
      onErrorRef.current?.(error);
      onCallStateChangeRef.current?.("failed");
    });
  }, [token, enabled, deviceOptions, reconnectNonce, suspendIdleDevice]);

  const reconnect = useCallback(() => {
    if (unmountedRef.current || !registrationEnabledRef.current) return;
    isReconnectingRef.current = true;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    const stale = deviceRef.current;
    deviceRef.current = null;
    teardownFailedRef.current = !teardownDevice(stale);
    setDevice(null);
    if (teardownFailedRef.current) {
      deviceRef.current = stale;
      const error = new Error("Phone cleanup did not finish. Try reconnecting again.");
      setError(error);
      setStatus("Error");
      onErrorRef.current?.(error);
      return;
    }
    setError(null);
    setStatus("disconnected");
    setReconnectNonce((n) => n + 1);
  }, [teardownDevice]);
  const reconnectRef = useRef(reconnect);
  reconnectRef.current = reconnect;

  /**
   * @effect Tear the Device down on unmount only: detach application listeners
   * and destroy with a safe error listener. destroy() closes the signalling
   * socket — the old unregister-only teardown leaked one socket per rebuild
   * over a shift.
   * @effect-deps teardownDevice — stable cleanup callback; reads live values via refs.
   * @effect-side-effects subscription cleanup + network (device.destroy()).
   * @effect-why-not-loader Imperative SDK teardown tied to component unmount.
   */
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      setupGenerationRef.current += 1;
      registrationEnabledRef.current = false;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      const device = deviceRef.current;
      deviceRef.current = null;
      teardownDevice(device);
    };
  }, [teardownDevice]);

  return {
    releaseIdleDevice: suspendIdleDevice,
    device,
    status,
    error,
    isRegistered: status === "Registered" || status === "Connected",
    reconnect,
  };
}
