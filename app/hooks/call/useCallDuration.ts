import { useEffect, useState } from 'react';

/**
 * Hook for tracking call duration
 * 
 * Automatically increments duration every second when callState is 'connected'
 * 
 * @param callState - Current call state (should be 'connected' to start tracking)
 * @returns Object containing callDuration and setCallDuration
 * 
 * @example
 * ```tsx
 * const { callDuration, setCallDuration } = useCallDuration(callState);
 * ```
 */
export function useCallDuration(callState: string) {
  const [callDuration, setCallDuration] = useState<number>(0);

  /**
   * @effect Tick the call-duration counter once per second while connected.
   * @effect-deps callState (starts the timer on 'connected', resets otherwise)
   * @effect-side-effects timer (setInterval) + functional setState; cleared on unmount/state change
   * @effect-why-not-loader Wall-clock elapsed time is live client state, not server request data.
   */
  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;

    if (callState === 'connected') {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      // Reset duration when call is not connected
      setCallDuration(0);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [callState]);

  return { callDuration, setCallDuration };
}

