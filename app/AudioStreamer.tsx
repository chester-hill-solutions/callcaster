import { useState, useEffect } from 'react';
import { logger } from '@/lib/logger.client';

interface AudioStreamerProps {
  id: string;
  token: string;
  /** Override the media-stream host in production. Defaults to MEDIA_STREAM_HOST. */
  host?: string;
}

const AudioStreamer = ({ id, token, host }: AudioStreamerProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [socket, setSocket] = useState<WebSocket | null>(null);

  useEffect(() => {
    const wsUrl =
      process.env.NODE_ENV === 'production'
        ? `wss://${host ?? process.env.MEDIA_STREAM_HOST}/${id}?token=${token}`
        : `ws://localhost:3001/${id}?token=${token}`;
    const ws = new WebSocket(wsUrl);
    setSocket(ws);

    return () => {
      ws.close();
    };
  }, [id, token, host]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const recorder = new MediaRecorder(stream);
      setMediaRecorder(recorder);

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0 && socket && socket.readyState === WebSocket.OPEN) {
          socket.send(event.data);
        }
      };

      recorder.start(1000); 
      setIsRecording(true);
    } catch (error) {
      logger.error('Error accessing media devices.', error);
    }
  };

  const stopRecording = () => {
    if (!mediaRecorder) {
      logger.warn("Tried to stop recording without an active media recorder");
      return;
    }

    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
    setIsRecording(false);
  };

  return (
    <div>
      <button onClick={startRecording} disabled={isRecording}>Start Streaming</button>
      <button onClick={stopRecording} disabled={!isRecording}>Stop Streaming</button>
    </div>
  );
};

export default AudioStreamer;
