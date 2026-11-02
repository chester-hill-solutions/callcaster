import { useCallback, useEffect, useMemo, useState } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";

export function usePhoneVerification() {
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

  /**
   * @effect Surface call-in verification results from the verify fetcher:
   * show errors via toast or capture the dial-in number on success.
   * @effect-deps verifyFetcher.data
   * @effect-side-effects toast + setVerificationPhoneNumber, setIsAddingNumber
   * @effect-why-not-loader Reacts to fetcher submission outcomes after the user
   * starts verification; not initial route data.
   */
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

  // Memoized so consumers (e.g. useCallScreen) can safely depend on the whole
  // object without it changing identity on every unrelated render — it only
  // changes when one of the underlying state values or callbacks actually does.
  return useMemo(
    () => ({
      isAddingNumber,
      setIsAddingNumber,
      newPhoneNumber,
      setNewPhoneNumber,
      handleVerifyNewNumber,
      verificationPhoneNumber,
    }),
    [
      isAddingNumber,
      newPhoneNumber,
      handleVerifyNewNumber,
      verificationPhoneNumber,
    ],
  );
}
