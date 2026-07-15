import { useCallback, useEffect, useMemo, useState } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { logger } from "@/lib/logger.client";

export function usePhoneVerification({
  verifiedNumbers,
}: {
  verifiedNumbers: string[];
}) {
  const [selectedDevice, setSelectedDevice] = useState<"computer" | string>("computer");
  const [phoneConnectionStatus, setPhoneConnectionStatus] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");
  const [phoneCallSid, setPhoneCallSid] = useState<string | null>(null);
  const [isAddingNumber, setIsAddingNumber] = useState(false);
  const [newPhoneNumber, setNewPhoneNumber] = useState("");

  const verifyFetcher = useFetcher<{
    success?: boolean;
    verificationId?: string;
    phoneNumber?: string;
    expiresAt?: string;
    error?: string;
  }>();
  const [verificationPhoneNumber, setVerificationPhoneNumber] = useState("");

  useEffect(() => {
    if (selectedDevice === "computer" || verifiedNumbers.includes(selectedDevice)) {
      return;
    }

    setSelectedDevice("computer");
    setPhoneConnectionStatus("disconnected");
    setPhoneCallSid(null);
  }, [selectedDevice, verifiedNumbers]);

  useEffect(() => {
    const data = verifyFetcher.data;
    if (!data) return;
    if (data.error || !data.success || !data.phoneNumber) {
      toast.error(data.error ?? "Failed to start call-in verification.");
      return;
    }

    setVerificationPhoneNumber(data.phoneNumber);
    setIsAddingNumber(false);
  }, [verifyFetcher.data]);

  const handleVerifyNewNumber = useCallback(() => {
    setVerificationPhoneNumber("");
    verifyFetcher.load(
      `/api/verify-call-in-session?phoneNumber=${encodeURIComponent(newPhoneNumber)}`,
    );
  }, [verifyFetcher, newPhoneNumber]);

  const handlePhoneDeviceSelection = useCallback(
    async (phoneNumber: string, requestMicrophoneAccess: () => Promise<void>) => {
      if (phoneNumber === "computer") {
        setSelectedDevice("computer");
        setPhoneConnectionStatus("disconnected");
        setPhoneCallSid(null);
        await requestMicrophoneAccess();
        return;
      }

      try {
        setSelectedDevice(phoneNumber);
        setPhoneConnectionStatus("disconnected");
        setPhoneCallSid(null);
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

  // Memoized so consumers (e.g. useCallScreen) can safely depend on the whole
  // object without it changing identity on every unrelated render — it only
  // changes when one of the underlying state values or callbacks actually does.
  return useMemo(
    () => ({
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
      verificationPhoneNumber,
      handlePhoneDeviceSelection,
    }),
    [
      selectedDevice,
      phoneConnectionStatus,
      phoneCallSid,
      isAddingNumber,
      newPhoneNumber,
      handleVerifyNewNumber,
      verificationPhoneNumber,
      handlePhoneDeviceSelection,
    ],
  );
}
