import { useState } from "react";

type UseCallScreenDialogsOptions = {
  hasScript: boolean;
  isPredictive: boolean;
};

export function useCallScreenDialogs({
  hasScript,
  isPredictive,
}: UseCallScreenDialogsOptions) {
  const [isErrorDialogOpen, setErrorDialog] = useState(!hasScript);
  const [isDialogOpen, setDialog] = useState(isPredictive && hasScript);
  const [isReportDialogOpen, setReportDialog] = useState(false);

  return {
    isErrorDialogOpen,
    setErrorDialog,
    isDialogOpen,
    setDialog,
    isReportDialogOpen,
    setReportDialog,
  };
}
