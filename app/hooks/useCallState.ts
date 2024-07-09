import { useReducer, useEffect } from 'react';

type CallState = 'idle' | 'dialing' | 'connected' | 'failed' | 'completed';

interface CallContext {
  callDuration: number;
  disposition: string;
}

type CallAction =
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

function callReducer(state: CallState, action: CallAction): CallState {
  switch (state) {
    case 'idle':
      if (action.type === 'START_DIALING') return 'dialing';
      if (action.type === 'HANG_UP') return 'completed';
      break;
    case 'dialing':
      if (action.type === 'CONNECT') return 'connected';
      if (action.type === 'FAIL') return 'failed';
      if (action.type === 'HANG_UP') return 'completed';
      break;
    case 'connected':
      if (action.type === 'HANG_UP') return 'completed';
      break;
    case 'failed':
      if (action.type === 'START_DIALING') return 'dialing';
      if (action.type === 'NEXT') return 'idle';
      break;
    case 'completed':
      if (action.type === 'NEXT') return 'idle';
      break;
  }
  return state;
}

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

export function useCallState() {
  const [state, dispatch] = useReducer(callReducer, 'idle');
  const [context, contextDispatch] = useReducer(contextReducer, initialContext);

  const send = (action: CallAction) => {
    dispatch(action);
    contextDispatch(action);
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (state === 'connected') {
      interval = setInterval(() => {
        send({ type: 'TICK' });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [state]);

  return { state, context, send };
}