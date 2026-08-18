import { useReducer, useCallback } from 'react';
import { logger } from "@/lib/logger.client";

/**
 * Call state machine states
 * - idle: Initial state, no active call
 * - dialing: Call is being initiated
 * - connected: Call is active and connected
 * - failed: Call failed to connect
 * - completed: Call has ended
 */
type CallState = 'idle' | 'dialing' | 'connected' | 'failed' | 'completed';

/**
 * Actions that can be dispatched to the call state machine
 * - START_DIALING: Begin a new call (idle/failed/completed -> dialing)
 * - CONNECT: Call successfully connected (dialing -> connected)
 * - FAIL: Call failed to connect (dialing -> failed)
 * - HANG_UP: End the current call (dialing/connected -> completed)
 * - NEXT: Move to next contact (failed/completed -> idle)
 */
export type CallAction =
  | { type: 'START_DIALING' }
  | { type: 'CONNECT' }
  | { type: 'FAIL' }
  | { type: 'HANG_UP' }
  | { type: 'NEXT' };

/**
 * Reducer for call state machine transitions
 * Enforces valid state transitions and logs warnings for invalid ones
 * 
 * @param state - Current call state
 * @param action - Action to dispatch
 * @returns New call state
 */
function callReducer(state: CallState, action: CallAction): CallState {
  switch (state) {
    case 'idle':
      if (action.type === 'START_DIALING') return 'dialing';
      if (action.type === 'HANG_UP') return 'completed';
      // Invalid transitions from idle
      if (action.type === 'CONNECT' || action.type === 'FAIL') {
        logger.warn(`Invalid transition from 'idle' state: ${action.type}`);
        return state;
      }
      break;
    case 'dialing':
      if (action.type === 'CONNECT') return 'connected';
      if (action.type === 'FAIL') return 'failed';
      if (action.type === 'HANG_UP') return 'completed';
      // Invalid transitions from dialing
      if (action.type === 'NEXT') {
        logger.warn(`Invalid transition from 'dialing' state: ${action.type}. Use HANG_UP or FAIL first.`);
        return state;
      }
      break;
    case 'connected':
      if (action.type === 'HANG_UP') return 'completed';
      // Invalid transitions from connected
      if (action.type === 'START_DIALING' || action.type === 'CONNECT' || action.type === 'FAIL' || action.type === 'NEXT') {
        logger.warn(`Invalid transition from 'connected' state: ${action.type}. Use HANG_UP first.`);
        return state;
      }
      break;
    case 'failed':
      if (action.type === 'START_DIALING') return 'dialing';
      if (action.type === 'NEXT') return 'idle';
      // Invalid transitions from failed
      if (action.type === 'CONNECT' || action.type === 'HANG_UP') {
        logger.warn(`Invalid transition from 'failed' state: ${action.type}. Use START_DIALING or NEXT.`);
        return state;
      }
      break;
    case 'completed':
      if (action.type === 'START_DIALING') return 'dialing';
      if (action.type === 'NEXT') return 'idle';
      // Invalid transitions from completed
      if (action.type === 'CONNECT' || action.type === 'FAIL' || action.type === 'HANG_UP') {
        logger.warn(`Invalid transition from 'completed' state: ${action.type}. Use START_DIALING or NEXT.`);
        return state;
      }
      break;
    default: {
      const unreachableState: never = state;
      return unreachableState;
    }
  }
  return state;
}

/**
 * Hook for managing call state using a finite state machine.
 *
 * Enforces valid state transitions and logs warnings for invalid ones. (Call
 * duration is tracked separately by `useCallDuration`; this hook is only the
 * lifecycle state machine.)
 *
 * @returns Object containing:
 *   - state: Current call state ('idle' | 'dialing' | 'connected' | 'failed' | 'completed')
 *   - send: Function to dispatch actions to the state machine
 *
 * @example
 * ```tsx
 * const { state, send } = useCallState();
 * send({ type: 'START_DIALING' });
 * send({ type: 'CONNECT' });
 * send({ type: 'HANG_UP' });
 * send({ type: 'NEXT' });
 * ```
 */
export function useCallState() {
  const [state, dispatch] = useReducer(callReducer, 'idle');

  const send = useCallback((action: CallAction) => {
    dispatch(action);
  }, []);

  return { state, send };
}
