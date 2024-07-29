import { useEffect, useState, useCallback, useRef } from 'react';
import { Device } from '@twilio/voice-sdk';

export function useTwilioDevice(token, workspaceId) {
    const deviceRef = useRef(null);
    const [status, setStatus] = useState('disconnected');
    const [error, setError] = useState(null);
    const [activeCall, setActiveCall] = useState(null);
    const [incomingCall, setIncomingCall] = useState(null);
    const [callState, setCallState] = useState('idle');
    const [callDuration, setCallDuration] = useState(0);

    const handleIncomingCall = useCallback((call) => {
        setIncomingCall(call);
        if (call.parameters.To.includes('client')) {
            call.accept();
            setStatus('connected');
            setCallState('connected');
            setIncomingCall(null);
        }

        const callEventHandlers = {
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
            call.on(event, handler);
        });
    }, []);

    const makeCall = useCallback((params) => {
        if (!deviceRef.current) {
            console.error('Device is not ready');
            return;
        }

        const connection = deviceRef.current.connect(params);
        setActiveCall(connection);
        setCallState('dialing');

        connection.on('accept', () => {
            setCallState('connected');
        });

        connection.on('disconnect', () => {
            setActiveCall(null);
            setStatus('disconnected');
            setCallState('completed');
            setCallDuration(0);
        });

        connection.on('error', (err) => {
            setError(err);
            setStatus('error');
            setCallState('failed');
            console.error('Call error:', err);
        });
    }, []);

    const hangUp = useCallback(() => {
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
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        })
        .then(() => {
            setStatus('Registered');
            activeCall.disconnect();
            setActiveCall(null);
            deviceRef.current.disconnectAll();
            setCallState('completed');
            setCallDuration(0);
        })
        .catch((error) => {
            console.error('Error hanging up call:', error);
            setError(error);
        });
    }, [activeCall, workspaceId]);
    
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

        const eventHandlers = {
            registered: () => setStatus('Registered'),
            unregistered: () => setStatus('Unregistered'),
            connecting: () => setStatus('Connecting'),
            connected: () => {
                setStatus('Connected');
                setCallState('connected');
            },
            disconnected: () => {
                setStatus('Disconnected');
                device.disconnectAll();
                setActiveCall(null);
                setCallState('completed');
                setCallDuration(0);
            },
            cancel: () => {
                setStatus('Cancelled');
                setActiveCall(null);
                setCallState('completed');
                setCallDuration(0);
            },
            error: (error) => {
                console.error('Twilio Device Error:', error);
                setStatus('Error');
                setError(error);
                setCallState('failed');
            },
            incoming: handleIncomingCall
        };

        Object.entries(eventHandlers).forEach(([event, handler]) => {
            device.on(event, handler);
        });

        device.register()
            .catch(error => {
                console.error('Failed to register device:', error);
                setError(error);
                setStatus('RegistrationFailed');
            });

        return () => {
            if (device.state === 'registered') {
                device.unregister().catch(console.error);
            }
            Object.keys(eventHandlers).forEach(event => {
                device.removeAllListeners(event);
            });
            deviceRef.current = null;
        };
    }, [handleIncomingCall, token]);

    useEffect(() => {
        let interval;
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
        setCallDuration
    };
}