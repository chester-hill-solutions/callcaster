import { data as routeData, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { useEffect, useState, useRef } from "react";
import * as wavefile from "wavefile";

import { logger } from "@/lib/logger.client";
import { env } from "@/lib/env.server";
import { createMediaStreamToken } from "@/lib/media-stream-token.server";
import { requireSessionUserId } from "@/lib/auth.server";

interface LoaderData {
  success: boolean;
  message: string;
  id: string;
  mediaStreamUrl: string;
  token: string;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { id } = params;
  try {
    const sessionId = id ?? "unknown";
    const userId = await requireSessionUserId(request);
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId") ?? sessionId;
    const campaignId = url.searchParams.get("campaignId") ?? "unknown";
    const token = createMediaStreamToken({
      workspaceId,
      campaignId,
      userId,
      sessionId,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const mediaStreamUrl = `wss://${env.MEDIA_STREAM_HOST()}/${sessionId}?token=${token}`;
    return routeData({
      success: true,
      message: "Call initiated",
      id: sessionId,
      mediaStreamUrl,
      token,
    });
  } catch (error) {
    return routeData({
      success: false,
      message: "Failed to initiate call",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export default function DashboardCallPage() {
  const { id, mediaStreamUrl } = useLoaderData<LoaderData>();
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const processorNode = useRef<ScriptProcessorNode | null>(null);
  const audioStream = useRef<MediaStream | null>(null);
  const audioBuffer = useRef<ArrayBuffer[]>([]);

  useEffect(() => {
    audioContext.current = new window.AudioContext();
    const ws = new WebSocket(mediaStreamUrl);

    ws.onopen = () => logger.debug("WebSocket connection established");
    ws.onerror = (event) => logger.error("WebSocket error:", event);
    ws.onclose = () => logger.debug("WebSocket connection closed");

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
      audioContext.current?.close();
    };
  }, [id, mediaStreamUrl]);

  function createWavFileFromBuffers(wavFiles: ArrayBuffer[], sampleRate: number) {
    // Implementation for creating WAV file from buffers
    // This is a placeholder - actual implementation would depend on requirements
    logger.debug(`Creating WAV file from ${wavFiles.length} buffers with sample rate ${sampleRate}`);
    return new ArrayBuffer(0); // Placeholder return
  }

  const playAudio = async () => {
    setIsPlaying(true);
    const wavBuffer = audioBuffer.current;
    if (wavBuffer.length) {
      try {
        const currentAudioContext = audioContext.current;
        if (!currentAudioContext) {
          logger.error("Audio context is not initialized");
          setIsPlaying(false);
          return;
        }

        const sampleRate = currentAudioContext.sampleRate;
        const wavFileBuffer = createWavFileFromBuffers(wavBuffer, sampleRate);
        const audioBufferDecoded = await currentAudioContext.decodeAudioData(
          wavFileBuffer,
        );

        const source = currentAudioContext.createBufferSource();
        source.buffer = audioBufferDecoded;
        source.connect(currentAudioContext.destination);
        source.start();
        source.onended = () => {
          setIsPlaying(false);
          audioBuffer.current = [];
        };
      } catch (error) {
        logger.error("Error decoding audio data:", error);
      }
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const currentAudioContext = audioContext.current;
      if (!currentAudioContext) {
        logger.error("Audio context is not initialized");
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      audioStream.current = stream;
      const source = currentAudioContext.createMediaStreamSource(stream);
      processorNode.current = currentAudioContext.createScriptProcessor(
        4096,
        1,
        1,
      );
      source.connect(processorNode.current);
      processorNode.current.connect(currentAudioContext.destination);

      processorNode.current.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const wav = new wavefile.WaveFile();
        wav.fromScratch(1, currentAudioContext.sampleRate, "32f", inputData);
        wav.toMuLaw();
        const buffer = Buffer.from(wav.toBuffer());
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(buffer);
        }
      };

      setIsRecording(true);
    } catch (error) {
      logger.error("Error accessing media devices.", error);
    }
  };

  const stopRecording = () => {
    if (audioStream.current && processorNode.current) {
      processorNode.current.disconnect();
      audioStream.current.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
    }
  };

  return (
    <div>
      <button onClick={startRecording} disabled={isRecording}>
        Start Streaming
      </button>
      <button onClick={stopRecording} disabled={!isRecording}>
        Stop Streaming
      </button>
    </div>
  );
}
