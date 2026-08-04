import { Await, useActionData, useLoaderData } from "react-router";
import { Suspense } from "react";
import { useActionFeedback } from "@/hooks/utils/useActionFeedback";

import type { TwilioPageData } from "../loadTwilioData.server";

import { LoadingCard } from "./AdminTwilioPortal.LoadingCard";
import { PortalContent } from "./AdminTwilioPortal.PortalContent";

type TwilioActionData = { success?: string; error?: string };

export default function WorkspaceTwilio() {
    const { twilioData } = useLoaderData<{ twilioData: Promise<TwilioPageData> }>();
    const actionData = useActionData<TwilioActionData>();

    useActionFeedback(actionData, {
        getSuccess: (data) => Boolean(data?.success),
        successMessage: (data) => data?.success ?? "Saved",
        getError: (data) => data?.error,
    });

    return (
        <div className="grid grid-cols-1 gap-6">
            <Suspense fallback={<LoadingCard title="Twilio Ops Portal" description="Loading Twilio account, strategy, and messaging insights..." />}>
                <Await
                    resolve={twilioData}
                    errorElement={
                        <div className="grid grid-cols-1 gap-6">
                            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                                <h3 className="font-semibold text-red-900">Failed to load Twilio data</h3>
                                <p className="mt-1 text-sm text-red-800">
                                    There was an error loading Twilio account information. Please refresh the page and try again.
                                </p>
                            </div>
                        </div>
                    }
                >
                    {(data: TwilioPageData) => <PortalContent data={data} />}
                </Await>
            </Suspense>
        </div>
    );
}
