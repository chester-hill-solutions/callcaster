import { useEffect, useState, useCallback, useRef } from 'react';
import { Device } from '@twilio/voice-sdk';

export function useTwilioDevice(token) {
    const deviceRef = useRef(null);
    const [status, setStatus] = useState('disconnected');
    const [error, setError] = useState(null);
    const [activeCall, setActiveCall] = useState(null);
    const [incomingCall, setIncomingCall] = useState(null);

    useEffect(() => {
        if (token && !deviceRef.current) {
            const device = new Device(token);
            deviceRef.current = device;

            device.on('registered', () => {
                console.log('Device registered and ready for calls');
                setStatus('Registered');
            });

            device.on('connect', (call) => {
                setStatus('Connected');
                setActiveCall(call);
                console.log('Call connected:', call);
            });

            device.on('disconnect', () => {
                setStatus('Disconnected');
                device.disconnectAll();
                activeCall?.disconnect();
                setActiveCall(null);
                setStatus('Registered')
            });

            device.on('cancel', () => {
                setStatus('Cancelled');
                setActiveCall(null);
                console.log('Call cancelled');
            });

            device.on('error', (error) => {
                console.error('Twilio Device Error:', error);
                setStatus('Error');
            });

            device.on('incoming', (call) => {
                setIncomingCall(call)
                if (call.parameters.To.includes('client')) {
                    call.accept();
                    setStatus('connected');
                    setIncomingCall(null);
                }
                call.on('accept', () => {
                    setActiveCall(call);
                    setStatus('connected');
                    setIncomingCall(null); // Clear incoming call when accepted
                    console.log('Call accepted');
                });
                call.on('disconnect', () => {
                    setActiveCall(null);
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
                device.state === 'registered' && device.unregister();
                deviceRef.current = null;
            };
        }
    }, [token]);


    const makeCall = useCallback((params) => {
        if (deviceRef.current) {
            console.log('Making call with params:', params);
            const connection = deviceRef.current.connect(params);
            setActiveCall(connection);

            connection.on('disconnect', () => {
                setActiveCall(null);
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
    }, [deviceRef.current]);

    const hangUp = useCallback(() => {
        if (activeCall) {
            /* activeCall.disconnect();
            deviceRef.current.disconnectAll(); */
            fetch(`/api/hangup`, {
                method: "POST",
                body: JSON.stringify(activeCall),
                headers: { "Cotnent-Type": 'application/json' }
            }).then(() => null).catch((e) => console.log(e))
            setStatus('Registered')
            setActiveCall(null)
        } else {
            console.error('No active call to hang up');
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
