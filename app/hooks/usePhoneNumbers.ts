import { useState, useCallback } from "react";
import { WorkspaceNumbers } from "~/lib/types";

export const usePhoneNumbers = (initialPhoneNumbers: WorkspaceNumbers[], workspace: string) => {
  const [phoneNumbers, setPhoneNumbers] = useState<WorkspaceNumbers[]>(initialPhoneNumbers);

  const updateWorkspaceNumbers = useCallback((payload: { eventType: string; old: WorkspaceNumbers | null; new: WorkspaceNumbers | null }) => {
    setPhoneNumbers((currentNumbers) => {
      switch (payload.eventType) {
        case "INSERT":
          if (payload.new && payload.new.workspace === workspace) {
            return [...currentNumbers, payload.new];
          }
          break;
        case "UPDATE":
          if (payload.new && payload.new.workspace === workspace) {
            return currentNumbers.map((item) => 
              item.id === payload.new?.id ? payload.new : item
            );
          }
          break;
        case "DELETE":
          if (payload.old) {
            return currentNumbers.filter((item) => item.id !== payload.old?.id);
          }
          break;
      }
      return currentNumbers;
    });
  }, [workspace]);

  return { phoneNumbers, setPhoneNumbers, updateWorkspaceNumbers };
};