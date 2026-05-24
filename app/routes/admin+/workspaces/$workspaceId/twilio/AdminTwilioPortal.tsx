import { Await, useActionData, useLoaderData } from "react-router";
import { Suspense, useEffect } from "react";
import { toast } from "sonner";

import type { TwilioPageData } from "../loadTwilioData.server";

import { LoadingCard } from "./AdminTwilioPortal.LoadingCard";
import { PortalContent } from "./AdminTwilioPortal.PortalContent";

type TwilioActionData = { success?: string; error?: string };

export default function WorkspaceTwilio() {
    const { twilioData } = useLoaderData<{ twilioData: Promise<TwilioPageData> }>();
    const actionData = useActionData<TwilioActionData>();

    useEffect(() => {
        if (actionData && "success" in actionData) {
            toast.success(actionData.success);
        }

        if (actionData && "error" in actionData) {
            toast.error(actionData.error);
        }
    }, [actionData]);

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
