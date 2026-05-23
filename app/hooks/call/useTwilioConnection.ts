import { useEffect, useState, useRef, useCallback } from 'react';
import type { Call, Device } from "@twilio/voice-sdk";
import { logger } from '@/lib/logger.client';

// The Voice SDK touches browser globals during module evaluation, so keep this
// lazy client-only require instead of moving it to the import block.
const getTwilioSDK = () => {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@twilio/voice-sdk');
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
 * Hook for managing Twilio device connection and registration
 * 
 * Handles device initialization, registration, and device-level events.
 * Call-related events are handled separately by useCallHandling.
 * 
 * @param options - Configuration options for the connection
 * @returns Device connection state and device instance
 * 
 * @example
 * ```tsx
 * const { device, status, error, isRegistered } = useTwilioConnection({
 *   token: twilioToken,
 *   onIncomingCall: (call) => handleIncomingCall(call),
 *   onStatusChange: (status) => console.log('Status:', status),
 * });
 * ```
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
  const [status, setStatus] = useState<string>('disconnected');
  const [error, setError] = useState<Error | null>(null);

  // Keep callback refs so effect only depends on token/deviceOptions and doesn't tear down device when callbacks change
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
      logger.error('No token provided');
      setError(new Error('No token provided'));
      onErrorRef.current?.(new Error('No token provided'));
      return;
    }

    if (typeof window === 'undefined') return;

    const SDK = getTwilioSDK();
    if (!SDK) return;

    const device = new SDK.Device(token, deviceOptions ?? undefined);
    deviceRef.current = device;

    const handleRegistered = () => {
      setStatus('Registered');
      onStatusChangeRef.current?.('Registered');
      onDeviceBusyChangeRef.current?.(false);
    };

    const handleUnregistered = () => {
      setStatus('Unregistered');
      onStatusChangeRef.current?.('Unregistered');
    };

    const handleConnecting = () => {
      setStatus('Connecting');
      onStatusChangeRef.current?.('Connecting');
    };

    const handleConnected = () => {
      setStatus('Connected');
      onStatusChangeRef.current?.('Connected');
      onCallStateChangeRef.current?.('connected');
    };

    const handleDisconnected = () => {
      setStatus('Disconnected');
      onDeviceBusyChangeRef.current?.(false);
      logger.debug('Call ended');
      device.disconnectAll();
    };

    const handleCancel = () => {
      setStatus('Cancelled');
      onStatusChangeRef.current?.('Cancelled');
      onDeviceBusyChangeRef.current?.(false);
    };

    const handleError = (err: Error) => {
      logger.error('Twilio Device Error:', err);
      onDeviceBusyChangeRef.current?.(false);
      setStatus('Error');
      setError(err);
      onErrorRef.current?.(err);
      onCallStateChangeRef.current?.('failed');
    };

    const handleIncoming = (call: Call) => {
      onIncomingCallRef.current?.(call);
    };

    device.on('registered', handleRegistered);
    device.on('unregistered', handleUnregistered);
    device.on('connecting', handleConnecting);
    device.on('connected', handleConnected);
    device.on('disconnected', handleDisconnected);
    device.on('cancel', handleCancel);
    device.on('error', handleError);
    device.on('incoming', handleIncoming);

    device.register().catch((err: Error) => {
      logger.error('Failed to register device:', err);
      setError(err);
      setStatus('RegistrationFailed');
      onErrorRef.current?.(err);
      onCallStateChangeRef.current?.('failed');
    });

    return () => {
      if (device.state === 'registered') {
        device.unregister().catch((err: Error) => logger.error('Error unregistering device:', err));
      }
      device.removeAllListeners('registered');
      device.removeAllListeners('unregistered');
      device.removeAllListeners('connecting');
      device.removeAllListeners('connected');
      device.removeAllListeners('disconnected');
      device.removeAllListeners('cancel');
      device.removeAllListeners('error');
      device.removeAllListeners('incoming');
      deviceRef.current = null;
    };
    // Only recreate device when token or deviceOptions identity changes
  }, [token, deviceOptions]);

  return {
    device: deviceRef.current,
    status,
    error,
    isRegistered: status === 'Registered' || status === 'Connected',
  };
}

