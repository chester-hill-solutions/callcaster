import { useEffect, useState, useCallback, useRef } from 'react';
import { Device } from '@twilio/voice-sdk';

export function useTwilioDevice(token) {
    const deviceRef = useRef(null);
    const [status, setStatus] = useState('disconnected');
    const [error, setError] = useState(null);
    const [activeCall, setActiveCall] = useState(null);
    const [incomingCall, setIncomingCall] = useState(null);


    const handleIncomingCall = useCallback((call) => {
        setIncomingCall(call);
        if (call.parameters.To.includes('client')) {
            call.accept();
            setStatus('connected');
            setIncomingCall(null);
        }

        const callEventHandlers = {
            accept: () => {
                setActiveCall(call);
                setStatus('connected');
                setIncomingCall(null);
            },
            disconnect: () => {
                setActiveCall(null);
                setStatus('Registered');
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

        connection.on('disconnect', () => {
            setActiveCall(null);
            setStatus('disconnected');
        });

        connection.on('error', (err) => {
            setError(err);
            setStatus('error');
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
            body: JSON.stringify({ callSid: activeCall.parameters.CallSid }),
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
        })
        .catch((error) => {
            console.error('Error hanging up call:', error);
            setError(error);
        });
    }, [activeCall]);
    
    const answer = useCallback(() => {
        if (incomingCall) {
            incomingCall.accept();
        } else {
            console.error('No incoming call to answer');
        }
    }, [incomingCall]);

    useEffect(() => {
        if (!token) return;
        const device = new Device(token, {});
        deviceRef.current = device;
        const eventHandlers = {
            registered: () => setStatus('Registered'),
            connect: () => setStatus('Connected'),
            disconnect: () => {
                console.log(device)
                setStatus('Disconnected');
                device.disconnectAll();
                activeCall?.disconnect();
                setActiveCall(null);
                setStatus('Registered');
            },
            cancel: () => {
                setStatus('Cancelled');
                setActiveCall(null);
            },
            error: (error) => {
                console.error('Twilio Device Error:', error);
                setStatus('Error');
                setError(error);
            },
            incoming: handleIncomingCall
        };

        Object.entries(eventHandlers).forEach(([event, handler]) => {
            device.on(event, handler);
        });

        device.register();

        return () => {
            if (device.state === 'registered') {
                device.unregister();
            }
            Object.keys(eventHandlers).forEach(event => {
                device.removeAllListeners(event);
            });
            deviceRef.current = null;
        };
    }, [activeCall, handleIncomingCall, token]);

    return {
        device: deviceRef.current,
        status,
        error,
        activeCall,
        incomingCall,
        makeCall,
        hangUp,
        answer,
    };
}