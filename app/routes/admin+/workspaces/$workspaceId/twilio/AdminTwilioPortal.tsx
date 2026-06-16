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
                <Await resolve={twilioData}>
                    {(data: TwilioPageData) => <PortalContent data={data} />}
                </Await>
            </Suspense>
        </div>
    );
}
