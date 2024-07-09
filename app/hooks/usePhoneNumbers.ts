import { useState, useCallback } from "react";

export const usePhoneNumbers = (initialPhoneNumbers: PhoneNumber[], workspace: string) => {
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>(initialPhoneNumbers);

  const updateWorkspaceNumbers = useCallback((payload: { eventType: string; old: PhoneNumber; new: PhoneNumber }) => {
    if (payload.eventType === "DELETE") {
      setPhoneNumbers((currentNumbers) => currentNumbers.filter((item) => item.id !== payload.old.id));
    }
    if (payload.new.workspace !== workspace) return;
    setPhoneNumbers((currentNumbers) => {
      const index = currentNumbers.findIndex((item) => item.id === payload.new.id);
      return index > -1
        ? currentNumbers.map((item) => (item.id === payload.new.id ? payload.new : item))
        : [...currentNumbers, payload.new];
    });
  }, [workspace]);

  return { phoneNumbers, setPhoneNumbers, updateWorkspaceNumbers };
};