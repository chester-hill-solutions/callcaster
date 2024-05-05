import { Outlet, useLoaderData, redirect, json, useFetcher } from '@remix-run/react';
import { createSupabaseServerClient } from '../supabase.server';
import { useEffect, useState, useRef } from 'react';
import { Device } from '@twilio/voice-sdk';

export const loader = async ({ request }) => {
    const { supabaseClient: supabase, headers } = createSupabaseServerClient(request);
    const { token } = await fetch('http://localhost:3000/api/token').then((res) => res.json());
    return json({ token }, { headers });
};

const Dashboard = () => {
    const { token } = useLoaderData();
    const [to, setTo] = useState('');
    const [call, setCall] = useState(null);
    const [device, setDevice] = useState(null);
    const [error, setError] = useState(null);
    const [transcript, setTranscript] = useState('');
    const audioContext = useRef(null);
    const mediaStreamSource = useRef(null);
    const processor = useRef(null);

    useEffect(() => {
        const device = new Device(token);
        setDevice(device);
        audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
    }, [])


    const makeCall = async () => {
        if (device) {
            device.audio.setAudioConstraints({
                echoCancellation: true,
                autoGainControl: true,
                noiseSupression: true
            })
            try {
                console.log(`Attempting call to ${to}.`)
                let call = await device.connect({
                    params: {
                        To: to,
                    },
                })
                setCall(call);
            } catch (err) {
                setError(error)
            }
        }
    }
    const makeRoboCall = async () => {
        await fetch('https://39b8-104-158-1-82.ngrok-free.app/api/call/robocall', {
            method:'POST',
            body:JSON.stringify({to})
        })
    }
    const makeVoiceDrop = async () => {
        await fetch('https://39b8-104-158-1-82.ngrok-free.app/api/call/audiodrop', {
            method:'POST',
            body:JSON.stringify({to})
        })
    }
    const hangUp = () => {
        if (mediaStreamSource.current && processor.current) {
            processor.current.disconnect();
            mediaStreamSource.current.disconnect();
            processor.current = null;
            mediaStreamSource.current = null;
        }
        device.disconnectAll();
    };

    return (
        <div>
            <div>
                <h1>Welcome to the dashboard</h1>
            </div>
            <div>
                <input
                    type='text'
                    name='to'
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder='Phone Number'
                    required
                />
                <button onClick={makeCall}>Call</button>
                <button onClick={makeRoboCall}>Robo Call</button>
                <button onClick={makeVoiceDrop}>Voice Drop</button>
                <button onClick={hangUp}>
                    Hang Up
                </button>
            </div>
            <div>
                <Outlet />
            </div>

            {error && <div>Error: {JSON.stringify(error)}</div>}

        </div>
    )
}
export default Dashboard;