import { useCallback, useState } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { logger } from "@/lib/logger.client";

export function usePhoneVerification({
  workspaceId,
  callerId,
}: {
  workspaceId: string;
  callerId: string | null | undefined;
}) {
  const [selectedDevice, setSelectedDevice] = useState<"computer" | string>("computer");
  const [phoneConnectionStatus, setPhoneConnectionStatus] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");
  const [phoneCallSid, setPhoneCallSid] = useState<string | null>(null);
  const [isAddingNumber, setIsAddingNumber] = useState(false);
  const [newPhoneNumber, setNewPhoneNumber] = useState("");

  const verifyFetcher = useFetcher<{
    verificationId: string;
    callSid: string;
    pin: string;
    error?: string;
  }>();
  const pin = verifyFetcher.data?.pin;

  const handleVerifyNewNumber = useCallback(async () => {
    verifyFetcher.load(
      `/api/verify-audio-session?phoneNumber=${newPhoneNumber}&fromNumber=${callerId}&workspace_id=${workspaceId}`,
    );
    toast.success(
      "Verification call initiated. Please answer your phone to complete verification.",
    );
    setIsAddingNumber(false);
  }, [verifyFetcher, newPhoneNumber, callerId, workspaceId]);

  const handlePhoneDeviceSelection = useCallback(
    async (phoneNumber: string, requestMicrophoneAccess: () => Promise<void>) => {
      if (phoneNumber === "computer") {
        setPhoneConnectionStatus("disconnected");
        setPhoneCallSid(null);
        await requestMicrophoneAccess();
        return;
      }

      try {
        setSelectedDevice(phoneNumber);
        setPhoneConnectionStatus("connected");
        toast.success("Connected to your phone. You can now make calls.");
      } catch (error) {
        logger.error("Error connecting phone device:", error);
        toast.error("Failed to connect to your phone. Please try again.");
        setPhoneConnectionStatus("disconnected");
        setSelectedDevice("computer");
        await requestMicrophoneAccess();
      }
    },
    [],
  );

  return {
    selectedDevice,
    setSelectedDevice,
    phoneConnectionStatus,
    setPhoneConnectionStatus,
    phoneCallSid,
    setPhoneCallSid,
    isAddingNumber,
    setIsAddingNumber,
    newPhoneNumber,
    setNewPhoneNumber,
    handleVerifyNewNumber,
    pin,
    handlePhoneDeviceSelection,
  };
}
