import React, { useState, useEffect } from 'react';

const AudioStreamer = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3000');
    setSocket(ws);

    return () => {
      ws.close();
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const recorder = new MediaRecorder(stream);
      setMediaRecorder(recorder);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0 && socket && socket.readyState === WebSocket.OPEN) {
          socket.send(event.data);
        }
      };

      recorder.start(1000); 
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing media devices.', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  return (
    <div>
      <button onClick={startRecording} disabled={isRecording}>Start Streaming</button>
      <button onClick={stopRecording} disabled={!isRecording}>Stop Streaming</button>
    </div>
  );
};

export default AudioStreamer;
