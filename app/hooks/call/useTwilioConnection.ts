import { useEffect, useState, useRef, useCallback } from 'react';
import { logger } from '~/lib/logger.client';

// Types - Device and Call instances are passed as parameters or created dynamically
type Device = any;
type Call = any;

// Lazy load Twilio SDK only on client side
const getTwilioSDK = () => {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@twilio/voice-sdk');
};

interface UseTwilioConnectionOptions {
  token: string;
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
  onIncomingCall,
  onStatusChange,
  onError,
  onCallStateChange,
  onDeviceBusyChange,
}: UseTwilioConnectionOptions): UseTwilioConnectionReturn {
  const deviceRef = useRef<Device | null>(null);
  const [status, setStatus] = useState<string>('disconnected');
  const [error, setError] = useState<Error | null>(null);

  const updateStatus = useCallback((newStatus: string) => {
    setStatus(newStatus);
    onStatusChange?.(newStatus);
  }, [onStatusChange]);

  const updateError = useCallback((err: Error) => {
    setError(err);
    onError?.(err);
  }, [onError]);

  useEffect(() => {
    if (!token) {
      console.error('No token provided');
      updateError(new Error('No token provided'));
      return;
    }

    if (typeof window === 'undefined') return;

    const SDK = getTwilioSDK();
    if (!SDK) return;

    const device = new SDK.Device(token);
    deviceRef.current = device;

    const handleRegistered = () => {
      updateStatus('Registered');
      onDeviceBusyChange?.(false);
    };

    const handleUnregistered = () => {
      updateStatus('Unregistered');
    };

    const handleConnecting = () => {
      updateStatus('Connecting');
    };

    const handleConnected = () => {
      updateStatus('Connected');
      onCallStateChange?.('connected');
    };

    const handleDisconnected = () => {
      updateStatus('Disconnected');
      onDeviceBusyChange?.(false);
      logger.debug('Call ended');
      device.disconnectAll();
    };

    const handleCancel = () => {
      updateStatus('Cancelled');
      onDeviceBusyChange?.(false);
    };

    const handleError = (err: Error) => {
      console.error('Twilio Device Error:', err);
      onDeviceBusyChange?.(false);
      updateStatus('Error');
      updateError(err);
      onCallStateChange?.('failed');
    };

    const handleIncoming = (call: Call) => {
      onIncomingCall?.(call);
    };

    device.on('registered', handleRegistered);
    device.on('unregistered', handleUnregistered);
    device.on('connecting', handleConnecting);
    device.on('connected', handleConnected);
    device.on('disconnected', handleDisconnected);
    device.on('cancel', handleCancel);
    device.on('error', handleError);
    device.on('incoming', handleIncoming);

    device.register()
      .catch((err: Error) => {
        console.error('Failed to register device:', err);
        updateError(err);
        updateStatus('RegistrationFailed');
        onCallStateChange?.('failed');
      });

    return () => {
      if (device.state === 'registered') {
        device.unregister().catch(console.error);
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
  }, [token, updateStatus, updateError, onIncomingCall, onCallStateChange, onDeviceBusyChange]);

  return {
    device: deviceRef.current,
    status,
    error,
    isRegistered: status === 'Registered' || status === 'Connected',
  };
}

