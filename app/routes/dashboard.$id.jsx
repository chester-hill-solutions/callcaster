import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useEffect, useState, useRef } from "react";
import * as wavefile from 'wavefile';

export const loader = async ({ request, params }) => {
  const { id } = params;
  try {
    return json({ success: true, message: 'Call initiated', id });
  } catch (error) {
    return json({ success: false, message: 'Failed to initiate call', error: error.message });
  }
};

export default function Call() {
  const { id } = useLoaderData();
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [socket, setSocket] = useState(null);
  const audioContext = useRef(null);
  const processorNode = useRef(null);
  const audioStream = useRef(null);
  const audioBuffer = useRef([]);

  useEffect(() => {
    audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
    const ws = new WebSocket(`wss://socketserver-production-2306.up.railway.app/${id}`);
    
    ws.onopen = () => console.log('WebSocket connection established');
    ws.onerror = (event) => console.error('WebSocket error:', event);
    ws.onclose = () => console.log('WebSocket connection closed');

    ws.onmessage = async (e) => {
      if (e.data) {
        const json = JSON.parse(e.data);
        audioBuffer.current.push(json.media.payload);
        if (!isPlaying) {
          playAudio();
        }
      }
    };

    setSocket(ws);

    return () => {
      ws.close();
      audioContext.current.close();
    };
  }, [id]);

  function createWavFileFromBuffers(wavFiles, sampleRate) {
    const wav = new wavefile.WaveFile();
    let allSamples = [];

    wavFiles.forEach(file => {
      const wav = new wavefile.WaveFile();
      wav.fromScratch(1, sampleRate, '8', Buffer.from(file, "base64"));
      wav.fromMuLaw();
      allSamples.push(...wav.getSamples(true, Float32Array));
    });

    wav.fromScratch(1, sampleRate, '8', allSamples);
    return wav.toBuffer();
  }

  const playAudio = async () => {
    setIsPlaying(true);
    const wavBuffer = audioBuffer.current;
    if (wavBuffer.length) {
      try {
        const sampleRate = audioContext.current.sampleRate;
        const wavFileBuffer = createWavFileFromBuffers(wavBuffer, sampleRate);
        const audioBufferDecoded = await audioContext.current.decodeAudioData(wavFileBuffer.buffer);

        const source = audioContext.current.createBufferSource();
        source.buffer = audioBufferDecoded;
        source.connect(audioContext.current.destination);
        source.start();
        source.onended = () => {
          setIsPlaying(false);
          audioBuffer.current = [];
        };
      } catch (error) {
        console.error('Error decoding audio data:', error);
      }
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStream.current = stream;
      const source = audioContext.current.createMediaStreamSource(stream);
      processorNode.current = audioContext.current.createScriptProcessor(4096, 1, 1);
      source.connect(processorNode.current);
      processorNode.current.connect(audioContext.current.destination);

      processorNode.current.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const wav = new wavefile.WaveFile();
        wav.fromScratch(1, audioContext.current.sampleRate, '32f', inputData);
        wav.toMuLaw();
        const buffer = Buffer.from(wav.toBuffer());
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(buffer, { binary: true });
        }
      };

      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing media devices.', error);
    }
  };

  const stopRecording = () => {
    if (audioStream.current && processorNode.current) {
      processorNode.current.disconnect();
      audioStream.current.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  return (
    <div>
      <button onClick={startRecording} disabled={isRecording}>Start Streaming</button>
      <button onClick={stopRecording} disabled={!isRecording}>Stop Streaming</button>
    </div>
  );
}
