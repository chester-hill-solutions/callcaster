import { useState } from "react";

type UseCallScreenDialogsOptions = {
  hasScript: boolean;
};

/**
 * The welcome dialog is the explicit "Join" gate (#1313): it opens for every
 * dial type whenever a script exists, and closes only via its own "Get
 * started" action (or the no-script error dialog takes over instead). It
 * used to open only for predictive campaigns, when it was purely
 * informational; now it's what the call screen's device-registration gate
 * waits on, so it has to cover every dial type.
 */
export function useCallScreenDialogs({
  hasScript,
}: UseCallScreenDialogsOptions) {
  const [isErrorDialogOpen, setErrorDialog] = useState(!hasScript);
  const [isDialogOpen, setDialog] = useState(hasScript);
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
