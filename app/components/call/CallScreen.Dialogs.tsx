import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, NavLink, useFetcher, useNavigate } from "react-router";
import { QueueItem } from "@/lib/types";
import { useActionFeedback } from "@/hooks/utils/useActionFeedback";

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
    status: string | null;
  };
  currentState: Record<string, unknown>;
  fetchMore: (params: Record<string, unknown>) => void;
  householdMap: Record<string, QueueItem[]>;
  isActive: boolean;
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
}) => {
  const [errorDescription, setErrorDescription] = useState<string>('');
  const fetcher = useFetcher<{ success?: boolean; message?: string; error?: string }>();
  const navigate = useNavigate();
  const handleSubmitError = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    fetcher.submit(
      JSON.stringify({
        errorDescription,
        currentState,
      }),
      {
        action: "/api/error-report",
        method: "POST",
        encType: "application/json",
      },
    );
  };

  useActionFeedback(fetcher.data, {
    successMessage: "Report sent",
    onSuccess: () => {
      setReportDialog(false);
      setErrorDescription("");
    },
  });

  return (
    <>
      <Dialog onOpenChange={() => { navigate(-1) }} open={!isActive}>
        <DialogContent className="w-full max-w-[450px] grid-cols-1 bg-card">
          <DialogHeader>
            <DialogTitle className="text-center font-Zilla-Slab text-2xl">
              {campaign.status === "draft" || campaign.status === "pending"
                ? "This campaign is not live yet."
                : campaign.status === "paused"
                  ? "This campaign is paused."
                  : "This campaign is currently inactive."}
            </DialogTitle>
            <div className="my-4 w-full">
              <p className="mb-2">
                {campaign.status === "draft" || campaign.status === "pending"
                  ? "Go to the Launch page and click \"Start calling\" to activate this campaign."
                  : campaign.status === "paused"
                    ? "Resume the campaign from the Launch page to start calling."
                    : "It is currently outside of the designated calling window for this campaign. Please check with your team for calling times."}
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
        <DialogContent className="flex w-full max-w-[450px] flex-col items-center bg-card">
          <DialogHeader>
            <DialogTitle className="text-center font-Zilla-Slab text-2xl">
              Welcome to {campaign.title}.
            </DialogTitle>
            <div className="my-4 w-full">
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
        <DialogContent className="flex w-full max-w-[450px] flex-col items-center bg-card">
          <DialogHeader>
            <DialogTitle className="text-center font-Zilla-Slab text-2xl">
              NO SCRIPT SET UP
            </DialogTitle>
            <div className="my-4 w-full">
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
        <DialogContent className="flex w-full max-w-[450px] flex-col items-center bg-card">
          <DialogHeader>
            <DialogTitle className="text-center font-Zilla-Slab text-2xl">
              Report an Issue
            </DialogTitle>
            <div className="my-4 w-full">
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
                  <Button type="submit" disabled={fetcher.state !== "idle"}>
                    {fetcher.state !== "idle" ? "Sending..." : "Submit Report"}
                  </Button>
                </div>
              </Form>
            </div>
          </DialogHeader>
        </DialogContent>
      </Dialog>

    </>
  );
};
