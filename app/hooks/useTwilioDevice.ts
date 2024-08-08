import { useEffect, useState, useCallback, useRef } from "react";
import { Device, Call, AudioProcessor } from "@twilio/voice-sdk";

type CallStatus = "idle" | "dialing" | "connected" | "completed" | "failed";
type DeviceStatus =
  | "disconnected"
  | "registered"
  | "unregistered"
  | "connecting"
  | "connected"
  | "disconnected"
  | "cancelled"
  | "error"
  | "registrationFailed";

interface AudioDevice {
  deviceId: string;
  label: string;
}

interface UseTwilioDeviceReturn {
  device: Device | null;
  status: DeviceStatus;
  error: Error | null;
  activeCall: Call | null;
  incomingCall: Call | null;
  makeCall: (params: Record<string, any>) => void;
  hangUp: () => void;
  answer: () => void;
  callState: CallStatus;
  callDuration: number;
  setCallDuration: React.Dispatch<React.SetStateAction<number>>;
  inputDevices: AudioDevice[];
  outputDevices: AudioDevice[];
  selectedInputDevice: AudioDevice | null;
  selectedOutputDevice: AudioDevice | null;
  setInputDevice: (deviceId: string) => Promise<void>;
  setOutputDevice: (deviceId: string) => Promise<void>;
  toggleInputMute: () => void;
  toggleOutputMute: () => void;
  isInputMuted: boolean;
  isOutputMuted: boolean;
  testOutputDevice: () => void;
  handleTokenRefresh: () => void;
}

export function useTwilioDevice(
  initialToken: string,
  workspaceId: string,
  userId: string,
): UseTwilioDeviceReturn {
  const deviceRef = useRef<Device | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<DeviceStatus>("disconnected");
  const [error, setError] = useState<Error | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [callState, setCallState] = useState<CallStatus>("idle");
  const [callDuration, setCallDuration] = useState<number>(0);
  const [token, setToken] = useState<string>(initialToken);
  const [reconnectToken, setReconnectToken] = useState<string | null>(null);
  const [inputDevices, setInputDevices] = useState<AudioDevice[]>([]);
  const [outputDevices, setOutputDevices] = useState<AudioDevice[]>([]);
  const [selectedInputDevice, setSelectedInputDevice] =
    useState<AudioDevice | null>(null);
  const [selectedOutputDevice, setSelectedOutputDevice] =
    useState<AudioDevice | null>(null);
  const [isInputMuted, setIsInputMuted] = useState<boolean>(false);
  const [isOutputMuted, setIsOutputMuted] = useState<boolean>(false);

  const handleTokenRefresh = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/token?id=${userId}&workspace=${workspaceId}`,
      );
      if (!response.ok) {
        throw new Error("Failed to refresh token");
      }
      const data = await response.json();
      setToken(data.token);
      if (deviceRef.current) {
        deviceRef.current.updateToken(data.token);
      }
    } catch (error) {
      console.error("Error refreshing token:", error);
      setError(
        error instanceof Error ? error : new Error("Failed to refresh token"),
      );
    }
  }, [userId, workspaceId]);

  const updateAudioDevices = useCallback(async () => {
    if (!deviceRef.current?.audio) {
      console.error("Audio interface is not available");
      return;
    }

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
      .then((mediaStream) => {
        mediaStreamRef.current  = mediaStream;
      });
      const inputs = Array.from(
        deviceRef.current.audio.availableInputDevices.values(),
      ).map((device) => ({
        deviceId: device.deviceId,
        label: device.label,
      }));
      const outputs = Array.from(
        deviceRef.current.audio.availableOutputDevices.values(),
      ).map((device) => ({
        deviceId: device.deviceId,
        label: device.label,
      }));

      setInputDevices(inputs);
      setOutputDevices(outputs);

      if (!selectedInputDevice && inputs.length > 0) {
        setSelectedInputDevice(inputs[0]);
      }
      if (!selectedOutputDevice && outputs.length > 0) {
        setSelectedOutputDevice(outputs[0]);
      }
    } catch (err) {
      console.error("Error updating audio devices:", err);
      setError(
        err instanceof Error
          ? err
          : new Error("Failed to update audio devices"),
      );
    }
  }, [selectedInputDevice, selectedOutputDevice]);

  const setInputDevice = useCallback(
    async (deviceId: string) => {
      if (!deviceRef.current?.audio) {
        throw new Error("Audio interface is not available");
      }

      try {
        await deviceRef.current.audio
          .setInputDevice(deviceId)
          .then(() => console.log(`New input device: `, deviceId));
        const newDevice = inputDevices.find(
          (device) => device.deviceId === deviceId,
        );
        if (newDevice) {
          setSelectedInputDevice(newDevice);
        }
      } catch (err) {
        console.error("Error setting input device:", err);
        throw err;
      }
    },
    [inputDevices],
  );

  const setOutputDevice = useCallback(
    async (deviceId: string) => {
      if (!deviceRef.current?.audio) {
        throw new Error("Audio interface is not available");
      }

      try {
        await deviceRef.current.audio.speakerDevices.set(deviceId);
        const newDevice = outputDevices.find(
          (device) => device.deviceId === deviceId,
        );
        if (newDevice) {
          setSelectedOutputDevice(newDevice);
        }
      } catch (err) {
        console.error("Error setting output device:", err);
        throw err;
      }
    },
    [outputDevices],
  );

  const toggleInputMute = useCallback(() => {
    if (activeCall) {
      activeCall.mute(!isInputMuted);
      setIsInputMuted(!isInputMuted);
    }
  }, [activeCall, isInputMuted]);

  const toggleOutputMute = useCallback(() => {
    const newMuteState = !isOutputMuted;
    const audioTrack = (mediaStreamRef.current?.getAudioTracks());
    console.log(audioTrack)
    if (activeCall) {
      setIsOutputMuted(newMuteState);
      console.log(`Output ${newMuteState ? "muted" : "unmuted"}`);
    } else {
      console.error("Device or audio not available");
    }
  }, [isOutputMuted]);

  const testOutputDevice = useCallback(() => {
    deviceRef.current?.audio?.speakerDevices.test();
  }, []);

  const handleIncomingCall = useCallback((call: Call) => {
    setIncomingCall(call);
    if (call.parameters.To && call.parameters.To.includes("client")) {
      call.accept();
      setStatus("connected");
      setCallState("connected");
      setIncomingCall(null);
    }

    const callEventHandlers: Record<string, () => void> = {
      accept: () => {
        setActiveCall(call);
        setStatus("connected");
        setCallState("connected");
        setIncomingCall(null);
      },
      disconnect: () => {
        setActiveCall(null);
        setStatus("registered");
        setCallState("completed");
        setCallDuration(0);
      },
      reject: () => setIncomingCall(null),
      cancel: () => setIncomingCall(null),
    };

    Object.entries(callEventHandlers).forEach(([event, handler]) => {
      call.on(event as any, handler);
    });
  }, []);

  const makeCall = useCallback((params: Record<string, any>) => {
    if (!deviceRef.current) {
      console.error("Device is not ready");
      return;
    }

    const connection = deviceRef.current.connect(params);
    setActiveCall(connection);
    setCallState("dialing");

    connection.on("accept", () => {
      setCallState("connected");
    });

    connection.on("disconnect", () => {
      setActiveCall(null);
      setStatus("disconnected");
      setCallState("completed");
      setCallDuration(0);
    });

    connection.on("error", (err: Error) => {
      setError(err);
      setStatus("error");
      setCallState("failed");
      console.error("Call error:", err);
    });
  }, []);

  const hangUp = useCallback(() => {
    if (!activeCall) {
      console.error("No active call to hang up");
      setError(new Error("No active call to hang up"));
      return;
    }

    fetch("/api/hangup", {
      method: "POST",
      body: JSON.stringify({
        callSid: activeCall.parameters.CallSid,
        workspaceId,
      }),
      headers: { "Content-Type": "application/json" },
    })
      .then((response) => {
        if (!response.ok) throw new Error("Network response was not ok");
        return response.json();
      })
      .then(() => {
        setStatus("registered");
        activeCall.disconnect();
        setActiveCall(null);
        deviceRef.current?.disconnectAll();
        setCallState("completed");
        setCallDuration(0);
      })
      .catch((error: Error) => {
        console.error("Error hanging up call:", error);
        setError(error);
      });
  }, [activeCall, workspaceId]);

  const answer = useCallback(() => {
    if (incomingCall) {
      incomingCall.accept();
      setCallState("connected");
    } else {
      console.error("No incoming call to answer");
    }
  }, [incomingCall]);

  useEffect(() => {
    if (!token) {
      console.error("No token provided");
      setError(new Error("No token provided"));
      return;
    }
    if (!deviceRef.current) {
      const device = new Device(token, {
        closeProtection: true,
      });

      deviceRef.current = device;

      const eventHandlers: Record<string, (error?: Error) => void> = {
        registered: () => setStatus("registered"),
        unregistered: () => setStatus("unregistered"),
        connecting: () => setStatus("connecting"),
        connected: () => {
          setStatus("connected");
          setCallState("connected");
        },
        disconnected: () => {
          setStatus("disconnected");
          device.disconnectAll();
          setActiveCall(null);
          setCallState("completed");
          setCallDuration(0);
        },
        cancel: () => {
          setStatus("cancelled");
          setActiveCall(null);
          setCallState("completed");
          setCallDuration(0);
        },
        error: (error: Error) => {
          console.error("Twilio Device Error:", error);
          setStatus("error");
          setError(error);
          setCallState("failed");
        },
        incoming: handleIncomingCall,
        tokenWillExpire: handleTokenRefresh,
      };

      Object.entries(eventHandlers).forEach(([event, handler]) => {
        device.on(event as any, handler as any);
      });
      ["deviceChange"].map((event) => {
        device.audio?.on(event, (e) => console.log(event, e));
      });
      device.on("deviceChange", updateAudioDevices);

      device
        .register()
        .then(() => {
          if (activeCall && reconnectToken) {
            device.connect({ connectToken: reconnectToken });
          }
        })
        .catch((error: Error) => {
          console.error("Failed to register device:", error);
          setError(error);
          setStatus("registrationFailed");
        });
    } else {
      deviceRef.current.updateToken(token);
      if (activeCall && reconnectToken) {
        deviceRef.current.connect({ connectToken: reconnectToken });
      }
    }

    updateAudioDevices();

    return () => {
      if (deviceRef.current) {
        if (deviceRef.current.state === "registered") {
          deviceRef.current.unregister().catch(console.error);
        }
        deviceRef.current.removeAllListeners();
        deviceRef.current = null;
      }
    };
  }, [
    token,
    handleIncomingCall,
    updateAudioDevices,
    handleTokenRefresh,
    activeCall,
    reconnectToken,
  ]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (callState === "connected") {
      interval = setInterval(() => {
        setCallDuration((prev) => prev + 1);
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
    inputDevices,
    outputDevices,
    selectedInputDevice,
    selectedOutputDevice,
    setInputDevice,
    setOutputDevice,
    toggleInputMute,
    toggleOutputMute,
    isInputMuted,
    isOutputMuted,
    testOutputDevice,
    handleTokenRefresh,
  };
}
