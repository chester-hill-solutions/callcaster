import { useEffect, useState, useCallback, useRef } from 'react';
import { Device } from '@twilio/voice-sdk';

export function useTwilioDevice(token) {
    const deviceRef = useRef(null);
    const initializedRef = useRef(false);
    const [status, setStatus] = useState('disconnected');
    const [error, setError] = useState(null);
    const [activeCall, setActiveCall] = useState({});
    const [incomingCall, setIncomingCall] = useState(null);

    useEffect(() => {
        if (token && !initializedRef.current) {
            initializedRef.current = true;
            const device = new Device(token);
            deviceRef.current = device;

            device.on('registered', () => {
                console.log('Device registered and ready for calls');
                setStatus('Registered');
            });

            device.on('connect', (call) => {
                setStatus('Connected');
            });

            device.on('disconnect', () => {
                setStatus('Disconnected');
                device.disconnectAll();
                activeCall?.disconnect();
                setActiveCall({});
                setStatus('Registered');
            });

            device.on('cancel', () => {
                setStatus('Cancelled');
                setActiveCall({});
                console.log('Call cancelled');
            });

            device.on('error', (error) => {
                console.error('Twilio Device Error:', error);
                setStatus('Error');
            });

            device.on('incoming', (call) => {
                setIncomingCall(call);
                if (call.parameters.To.includes('client')) {
                    call.accept();
                    setStatus('connected');
                    setIncomingCall(null);
                }
                call.on('accept', () => {
                    setActiveCall(call);
                    setStatus('connected');
                    setIncomingCall(null);
                    console.log('Call accepted');
                });
                call.on('disconnect', () => {
                    setActiveCall({});
                    setStatus('Registered');
                    console.log('Call disconnected');
                });
                call.on('reject', () => {
                    setIncomingCall(null);
                    console.log('Call rejected');
                });
                call.on('cancel', () => {
                    setIncomingCall(null);
                    console.log('Call canceled');
                });
            });

            device.register();

            return () => {
                if (device.state === 'registered') {
                    device.unregister();
                }
                deviceRef.current = null;
                initializedRef.current = false;
            };
        }
    }, [token]);

    const makeCall = useCallback((params) => {
        if (deviceRef.current) {
            console.log('Making call with params:', params);
            const connection = deviceRef.current.connect(params);
            setActiveCall(connection);

            connection.on('disconnect', () => {
                setActiveCall({});
                setStatus('disconnected');
                console.log('Call disconnected');
            });

        connection.on('error', (err) => {
                setError(err);
                setStatus('error');
                console.error('Call error:', err);
            });
        } else {
            console.error('Device is not ready');
        }
    }, []);

    const hangUp = useCallback(() => {
        if (activeCall) {
            /* activeCall.disconnect();
            deviceRef.current.disconnectAll(); */
            fetch(`/api/hangup`, {
                method: "POST",
                body: JSON.stringify({ callSid: activeCall.parameters.CallSid }),
                headers: { "Content-Type": 'application/json' }
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(() => {
                setStatus('Registered');
                activeCall?.disconnect();
                setActiveCall({});
                deviceRef.current.disconnectAll();
            })
            .catch((error) => {
                console.error('Error hanging up call:', error);
                setError(error);
            });
        } else {
            console.error('No active call to hang up');
            setError(new Error('No active call to hang up'));
        }
    }, [activeCall]);
    
    const answer = useCallback(() => {
        if (incomingCall) {
            console.log('Answering incoming call');
            incomingCall.accept();
        } else {
            console.error('No incoming call to answer');
        }
    }, [incomingCall]);

    return {
        device: deviceRef?.current,
        status,
        error,
        activeCall,
        incomingCall,
        makeCall,
        hangUp,
        answer,
    };
}
