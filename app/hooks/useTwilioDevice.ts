import { useEffect, useState, useCallback, useRef } from 'react';
import { Device, Call } from '@twilio/voice-sdk';

interface TwilioDeviceHook {
  device: Device | null;
  status: string;
  error: Error | null;
  activeCall: Call | null;
  incomingCall: Call | null;
  makeCall: (params: any) => void;
  hangUp: () => void;
  answer: () => void;
  callState: string;
  callDuration: number;
  setCallDuration: React.Dispatch<React.SetStateAction<number>>;
  setIsBusy: React.Dispatch<React.SetStateAction<boolean>>;
  deviceIsBusy: boolean;
}

export function useTwilioDevice(token: string, workspaceId: string, send: (action: { type: string }) => void): TwilioDeviceHook {
    const deviceRef = useRef<Device | null>(null);
    const [status, setStatus] = useState<string>('disconnected');
    const [error, setError] = useState<Error | null>(null);
    const [activeCall, setActiveCall] = useState<Call | null>(null);
    const [incomingCall, setIncomingCall] = useState<Call | null>(null);
    const [callState, setCallState] = useState<string>('idle');
    const [callDuration, setCallDuration] = useState<number>(0);
    const [deviceIsBusy, setIsBusy] = useState<boolean>(false);

    const handleIncomingCall = useCallback((call: Call) => {
        setIncomingCall(call);
        if (call.parameters.To.includes('client')) {
            call.accept();
            setStatus('connected');
            setCallState('connected');
            send({ type: "CONNECT" });
            setIncomingCall(null);
        }

        const callEventHandlers: { [key: string]: () => void } = {
            accept: () => {
                setActiveCall(call);
                setStatus('connected');
                setCallState('connected');
                setIncomingCall(null);
            },
            disconnect: () => {
                setActiveCall(null);
                setStatus('Registered');
                setCallState('completed');
                setCallDuration(0);
            },
            reject: () => setIncomingCall(null),
            cancel: () => setIncomingCall(null)
        };

        Object.entries(callEventHandlers).forEach(([event, handler]) => {
            call.on(event as any, handler);
        });
    }, [send]);

    const makeCall = useCallback((params: any) => {
        if (!deviceRef.current) {
            console.error('Device is not ready');
            return;
        }
        const connection = deviceRef.current.connect(params);
        connection.then((call) => {
            setActiveCall(call);
            setCallState('dialing');
        });
    }, []);

    const hangUp = useCallback(() => {
        setIsBusy(false);
        if (!activeCall) {
            console.error('No active call to hang up');
            setError(new Error('No active call to hang up'));
            return;
        }

        fetch('/api/hangup', {
            method: "POST",
            body: JSON.stringify({ callSid: activeCall.parameters.CallSid, workspaceId }),
            headers: { "Content-Type": 'application/json' }
        })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => {
                        throw new Error(err.message || 'Network response was not ok');
                    });
                }
                return response.json();
            })
            .then(() => {
                setStatus('Registered');
                activeCall.disconnect();
                setActiveCall(null);
                deviceRef.current?.disconnectAll();
                setCallState('completed');
                setCallDuration(0);
            })
            .catch((error: Error) => {
                console.error('Error hanging up call:', error);
                if (error.message === 'Call is not in-progress. Cannot redirect.') {
                    console.log('Call was already disconnected');
                    setStatus('Registered');
                    setActiveCall(null);
                    setCallState('completed');
                    setCallDuration(0);
                } else {
                    setError(error);
                }
            });
    }, [activeCall, setIsBusy, workspaceId]);

    const answer = useCallback(() => {
        if (incomingCall) {
            incomingCall.accept();
            setCallState('connected');
        } else {
            console.error('No incoming call to answer');
        }
    }, [incomingCall]);

    useEffect(() => {
        if (!token) {
            console.error('No token provided');
            setError(new Error('No token provided'));
            return;
        }

        const device = new Device(token, {
            debug: true
        });
        deviceRef.current = device;

        const eventHandlers: { [key: string]: (...args: any[]) => void } = {
            registered: () => { setStatus('Registered'); setIsBusy(false) },
            unregistered: () => setStatus('Unregistered'),
            connecting: () => setStatus('Connecting'),
            connected: () => {
                setStatus('Connected');
                setCallState('connected');
            },
            disconnected: () => {
                setStatus('Disconnected');
                setIsBusy(false);
                console.log('Call ended')
                device.disconnectAll();
                setActiveCall(null);
                setCallState('completed');
                setCallDuration(0);
            },
            cancel: () => {
                setStatus('Cancelled');
                setIsBusy(false);
                setActiveCall(null);
                setCallState('completed');
                setCallDuration(0);
            },
            error: (error: Error) => {
                console.error('Twilio Device Error:', error);
                setIsBusy(false);
                setStatus('Error');
                setError(error);
                setCallState('failed');
            },
            incoming: handleIncomingCall
        };

        Object.entries(eventHandlers).forEach(([event, handler]) => {
            device.on(event as any, handler);
        });

        device.register()
            .catch((error: Error) => {
                console.error('Failed to register device:', error);
                setError(error);
                setStatus('RegistrationFailed');
            });

        return () => {
            if (device.state === 'registered') {
                device.unregister().catch(console.error);
            }
            Object.keys(eventHandlers).forEach(event => {
                device.removeAllListeners(event as any);
            });
            deviceRef.current = null;
        };
    }, [handleIncomingCall, token]);

    useEffect(() => {
        const eventHandlers: { [key: string]: (...args: any[]) => void } = {
            accept: (call: Call) => { setCallState('connected') },
            audio: (e: any) => { console.log(e) },
            disconnect: () => {
                console.log('Call ended')
                setActiveCall(null);
                setStatus('Registered');
                setCallState('completed');
                setIsBusy(false);
                setCallDuration(0);
            },
            error: (error: Error) => {
                setIsBusy(false);
                setError(error);
                setStatus('error');
                setCallState('failed');
                console.error('Call error:', error);
            }
        }
        if (activeCall) {
            Object.entries(eventHandlers).forEach(([event, handler]) => {
                activeCall.on(event as any, handler);
            });
        }
        return () => {
            Object.keys(eventHandlers).forEach(event => {
                activeCall?.removeAllListeners(event as any);
            });
        }
    }, [activeCall])

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (callState === 'connected') {
            interval = setInterval(() => {
                setCallDuration(prev => prev + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [callState]);

    return {
        device: deviceRef.current,
        status,
        error,
        activeCall,
        incomingCall,
        makeCall,
        hangUp,
        answer,
        callState,
        callDuration,
        setCallDuration,
        setIsBusy,
        deviceIsBusy
    };
}