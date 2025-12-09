import { useReducer, useEffect, useCallback } from 'react';

/**
 * Call state machine states
 * - idle: Initial state, no active call
 * - dialing: Call is being initiated
 * - connected: Call is active and connected
 * - failed: Call failed to connect
 * - completed: Call has ended
 */
type CallState = 'idle' | 'dialing' | 'connected' | 'failed' | 'completed';

interface CallContext {
  callDuration: number;
  disposition: string;
}

/**
 * Actions that can be dispatched to the call state machine
 * - START_DIALING: Begin a new call (idle/failed/completed -> dialing)
 * - CONNECT: Call successfully connected (dialing -> connected)
 * - FAIL: Call failed to connect (dialing -> failed)
 * - HANG_UP: End the current call (dialing/connected -> completed)
 * - TICK: Increment call duration timer (internal, used when connected)
 * - SET_DISPOSITION: Set call disposition/outcome
 * - NEXT: Move to next contact (failed/completed -> idle)
 */
export type CallAction =
  | { type: 'START_DIALING' }
  | { type: 'CONNECT' }
  | { type: 'FAIL' }
  | { type: 'HANG_UP' }
  | { type: 'TICK' }
  | { type: 'SET_DISPOSITION'; disposition: string }
  | { type: 'NEXT' };

const initialContext: CallContext = {
  callDuration: 0,
  disposition: '',
};

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
        console.warn(`Invalid transition from 'idle' state: ${action.type}`);
        return state;
      }
      break;
    case 'dialing':
      if (action.type === 'CONNECT') return 'connected';
      if (action.type === 'FAIL') return 'failed';
      if (action.type === 'HANG_UP') return 'completed';
      // Invalid transitions from dialing
      if (action.type === 'NEXT') {
        console.warn(`Invalid transition from 'dialing' state: ${action.type}. Use HANG_UP or FAIL first.`);
        return state;
      }
      break;
    case 'connected':
      if (action.type === 'HANG_UP') return 'completed';
      // Invalid transitions from connected
      if (action.type === 'START_DIALING' || action.type === 'CONNECT' || action.type === 'FAIL' || action.type === 'NEXT') {
        console.warn(`Invalid transition from 'connected' state: ${action.type}. Use HANG_UP first.`);
        return state;
      }
      break;
    case 'failed':
      if (action.type === 'START_DIALING') return 'dialing';
      if (action.type === 'NEXT') return 'idle';
      // Invalid transitions from failed
      if (action.type === 'CONNECT' || action.type === 'HANG_UP') {
        console.warn(`Invalid transition from 'failed' state: ${action.type}. Use START_DIALING or NEXT.`);
        return state;
      }
      break;
    case 'completed':
      if (action.type === 'START_DIALING') return 'dialing';
      if (action.type === 'NEXT') return 'idle';
      // Invalid transitions from completed
      if (action.type === 'CONNECT' || action.type === 'FAIL' || action.type === 'HANG_UP') {
        console.warn(`Invalid transition from 'completed' state: ${action.type}. Use START_DIALING or NEXT.`);
        return state;
      }
      break;
  }
  return state;
}

/**
 * Reducer for call context (duration, disposition)
 * Manages side data associated with the call state
 * 
 * @param state - Current call context
 * @param action - Action to dispatch
 * @returns New call context
 */
function contextReducer(state: CallContext, action: CallAction): CallContext {
  switch (action.type) {
    case 'TICK':
      return { ...state, callDuration: state.callDuration + 1 };
    case 'SET_DISPOSITION':
      return { ...state, disposition: action.disposition };
    case 'NEXT':
    case 'START_DIALING':
      return initialContext;
    default:
      return state;
  }
}

/**
 * Hook for managing call state using a finite state machine
 * 
 * Provides a state machine for call lifecycle management with automatic duration tracking.
 * The hook enforces valid state transitions and automatically increments call duration
 * when the call is connected.
 * 
 * @returns Object containing:
 *   - state: Current call state ('idle' | 'dialing' | 'connected' | 'failed' | 'completed')
 *   - context: Call context containing duration and disposition
 *   - send: Function to dispatch actions to the state machine
 * 
 * @example
 * ```tsx
 * const { state, context, send } = useCallState();
 * 
 * // Start a call
 * send({ type: 'START_DIALING' });
 * 
 * // When call connects
 * send({ type: 'CONNECT' });
 * 
 * // Set disposition
 * send({ type: 'SET_DISPOSITION', disposition: 'answered' });
 * 
 * // End call
 * send({ type: 'HANG_UP' });
 * 
 * // Move to next contact
 * send({ type: 'NEXT' });
 * ```
 * 
 * @example
 * ```tsx
 * // Access call duration
 * const duration = context.callDuration; // seconds
 * 
 * // Access disposition
 * const disposition = context.disposition;
 * ```
 */
export function useCallState() {
  const [state, dispatch] = useReducer(callReducer, 'idle');
  const [context, contextDispatch] = useReducer(contextReducer, initialContext);

  const send = useCallback((action: CallAction) => {
    dispatch(action);
    contextDispatch(action);
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (state === 'connected') {
      interval = setInterval(() => {
        send({ type: 'TICK' });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [state, send]);

  return { state, context, send };
}
