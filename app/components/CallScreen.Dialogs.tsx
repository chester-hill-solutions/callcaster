import React, { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Form, NavLink, useFetcher, useNavigate, useNavigation, useSubmit } from "@remix-run/react";

interface CampaignDialogsProps {
  isDialogOpen: boolean;
  setDialog: (open: boolean) => void;
  isErrorDialogOpen: boolean;
  setErrorDialog: (open: boolean) => void;
  isReportDialogOpen: boolean;
  setReportDialog: (open: boolean) => void;
  campaign: {
    title: string;
    dial_type: string;
    voicemail_file: boolean;
  };
  currentState: any;
  fetchMore: (params: any) => void;
  householdMap: any;
  isActive: boolean;
  creditsError?: boolean;
  hasAccess: boolean;
}

export const CampaignDialogs: React.FC<CampaignDialogsProps> = ({
  isDialogOpen,
  setDialog,
  isErrorDialogOpen,
  setErrorDialog,
  isReportDialogOpen,
  setReportDialog,
  campaign,
  fetchMore,
  householdMap,
  currentState,
  isActive,
  creditsError,
  hasAccess
}) => {
  const [errorDescription, setErrorDescription] = useState<string>('');
  const [isCreditsDialogOpen, setCreditsDialogOpen] = useState(!!creditsError);
  const { state } = useNavigation();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const handleSubmitError = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    fetcher.submit(
      {
        errorDescription,
        currentState,
      },
      {
        action: "/api/error-report",
        method: "POST",
        encType: "application/json",
        navigate: false,
      },
    );
  };

  useEffect(() => {
    if (state === 'idle') {
      setCreditsDialogOpen(!!creditsError)
    }
  }, [creditsError, state])

  return (
    <>
      <Dialog onOpenChange={() => { navigate(-1) }} open={!isActive}>
        <DialogContent className="flex w-[450px] flex-col items-center bg-card">
          <DialogHeader>
            <DialogTitle className="text-center font-Zilla-Slab text-2xl">
              This campaign is currently inactive.
            </DialogTitle>
            <div className="my-4 w-[400px]">
              <p className="mb-2">
                It is currently outside of the designated calling window for this campaign. Please check with your team for calling times.
              </p>
            </div>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => { navigate(-1) }}>
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setDialog} open={isDialogOpen && !!isActive}>
        <DialogContent className="flex w-[450px] flex-col items-center bg-card">
          <DialogHeader>
            <DialogTitle className="text-center font-Zilla-Slab text-2xl">
              Welcome to {campaign.title}.
            </DialogTitle>
            <div className="my-4 w-[400px]">
              <p>
                This is a{" "}
                {campaign.dial_type === "call"
                  ? "power dialer campaign. Contacts will load into your queue as you dial."
                  : "predictive dialer campaign. Contacts will be dialed automatically until a conversation is found for you. When you have completed a call, you can press 'Dial' to resume the predictive dialer."}
              </p>
              <br />
              <p>
                {campaign.voicemail_file && campaign.dial_type === "call"
                  ? "The dialer will automatically detect voicemailboxes, and leave a voicemail with the contact."
                  : "The dialer will automatically detect voicemailboxes, and disconnect your call accordingly."}
              </p>
              <div className="mt-4 flex justify-between">
                <Button asChild className="border-primary" variant="outline">
                  <NavLink to=".." relative="path">
                    Go Back
                  </NavLink>
                </Button>
                <Button
                  onClick={() => {
                    campaign.dial_type === "call" &&
                      fetchMore({ householdMap });
                    setDialog(false);
                  }}
                >
                  Get started
                </Button>
              </div>
            </div>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setErrorDialog} open={isErrorDialogOpen}>
        <DialogContent className="flex w-[450px] flex-col items-center bg-card">
          <DialogHeader>
            <DialogTitle className="text-center font-Zilla-Slab text-2xl">
              NO SCRIPT SET UP
            </DialogTitle>
            <div className="my-4 w-[400px]">
              <p>
                This campaign has not been configured with a script. Contact
                your administrator to get one set up
              </p>
              <div className="mt-4 flex justify-between">
                <Button asChild className="border-primary" variant="outline">
                  <NavLink to=".." relative="path">
                    Go Back
                  </NavLink>
                </Button>
              </div>
            </div>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setReportDialog} open={isReportDialogOpen}>
        <DialogContent className="flex w-[450px] flex-col items-center bg-card">
          <DialogHeader>
            <DialogTitle className="text-center font-Zilla-Slab text-2xl">
              Report an Issue
            </DialogTitle>
            <div className="my-4 w-[400px]">
              <Form onSubmit={handleSubmitError}>
                <p className="mb-2">
                  Please provide a detailed description of your issue, as well
                  as any details you may be able to provide about activities
                  immediately prior to the issues you're experiencing.
                </p>
                <textarea
                  value={errorDescription}
                  onChange={(e) => setErrorDescription(e.target.value)}
                  placeholder="Describe the issue here..."
                  className="mb-4 w-full resize-none rounded-sm"
                  rows={3}
                />
                <div className="mt-4 flex justify-between">
                  <Button
                    type="button"
                    className="border-primary"
                    variant="outline"
                    onClick={() => setReportDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">Submit Report</Button>
                </div>
              </Form>
            </div>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setCreditsDialogOpen} open={isCreditsDialogOpen}>
        <DialogContent className="flex w-[450px] flex-col items-center bg-card">
          <DialogHeader>
            <DialogTitle className="text-center font-Zilla-Slab text-2xl">
              {hasAccess ? 'No Credits Remaining' : 'Campaign Disabled'}
            </DialogTitle>
            <div className="my-6 w-[400px]">
              <p>
                You have no credits remaining for this campaign. {hasAccess ? 'Purchase more credits to continue this campaign.' : 'Please contact your administrator to enable the campaign.'}
              </p>
            </div>
            <DialogFooter>
              <Button asChild>
                <NavLink to={hasAccess ? "../../../settings/credits" : ".."} relative="path">
                  {hasAccess ? 'Purchase Credits' : 'Go Back'}
                </NavLink>
              </Button>
            </DialogFooter>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
};
