import { useState, useCallback } from 'react';
import { Call, Device } from '@twilio/voice-sdk';
import { QueueItem, ActiveCall, OutreachAttempt } from '~/lib/types';

interface TwilioConference {
  sid: string;
  status: string;
  participants: any[];
  parameters: {
    CallSid: string;
    [key: string]: any;
  };
}

export interface CallScreenState {
  // Audio state
  stream: MediaStream | null;
  microphone: string | null;
  output: string | null;
  isMicrophoneMuted: boolean;
  availableMicrophones: MediaDeviceInfo[];
  availableSpeakers: MediaDeviceInfo[];
  permissionError: string | null;

  // Phone state
  selectedDevice: string;
  phoneConnectionStatus: string;
  phoneCallSid: string | null;
  isAddingNumber: boolean;
  newPhoneNumber: string;
  pin: string | null;

  // Queue state
  queue: QueueItem[] | null;
  predictiveQueue: QueueItem[] | null;
  nextRecipient: QueueItem | null;
  questionContact: QueueItem | null;
  recentAttempt: OutreachAttempt | null;
  disposition: string | null;
  householdMap: Record<string, any>;
  availableCredits: number;
  attemptList: OutreachAttempt[];
  callsList: ActiveCall[];
  recentCall: ActiveCall | null;

  // Device state
  callState: string;
  deviceStatus: string;
  activeCall: Call | null;
  conference: TwilioConference | null;
  callDuration: number;
  deviceIsBusy: boolean;
  incomingCall: Call | null;
  creditsError: boolean;

  // UI state
  isDialogOpen: boolean;
  isErrorDialogOpen: boolean;
  isReportDialogOpen: boolean;
  isBusy: boolean;
  update: Record<string, any> | null;
}

export const useCallScreenState = (initialState: Partial<CallScreenState> = {}) => {
  const [state, setState] = useState<CallScreenState>({
    // Audio state
    stream: null,
    microphone: null,
    output: null,
    isMicrophoneMuted: false,
    availableMicrophones: [],
    availableSpeakers: [],
    permissionError: null,

    // Phone state
    selectedDevice: 'computer',
    phoneConnectionStatus: 'disconnected',
    phoneCallSid: null,
    isAddingNumber: false,
    newPhoneNumber: '',
    pin: null,

    // Queue state
    queue: null,
    predictiveQueue: null,
    nextRecipient: null,
    questionContact: null,
    recentAttempt: null,
    disposition: null,
    householdMap: {},
    availableCredits: 0,
    attemptList: [],
    callsList: [],
    recentCall: null,

    // Device state
    callState: 'idle',
    deviceStatus: 'disconnected',
    activeCall: null,
    conference: null,
    callDuration: 0,
    deviceIsBusy: false,
    incomingCall: null,
    creditsError: false,

    // UI state
    isDialogOpen: false,
    isErrorDialogOpen: false,
    isReportDialogOpen: false,
    isBusy: false,
    update: null,
    ...initialState,
  });

  const updateState = useCallback((newState: Partial<CallScreenState> | ((prev: CallScreenState) => Partial<CallScreenState>)) => {
    setState(prev => {
      const updatedState = typeof newState === 'function' ? newState(prev) : newState;
      return { ...prev, ...updatedState };
    });
  }, []);

  return { state, updateState };
}; 