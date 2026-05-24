import { buildOnboardingStepsForState, getWorkspaceMessagingOnboardingState, mergeWorkspaceMessagingOnboardingState, updateWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding.server";
import { createClient } from '@supabase/supabase-js';
import { createErrorResponse } from "@/lib/errors.server";
import { createWorkspaceTwilioInstance, getWorkspaceUsers, requireWorkspaceAccess } from "@/lib/database.server";
import { env } from "@/lib/env.server";
import { insertTransactionHistoryIdempotent } from "@/lib/transaction-history.server";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/supabase.server";
import Twilio from 'twilio';
import type { LoaderFunctionArgs } from "react-router";

interface FormData {
  phoneNumber: string;
  workspace_id: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {

    await verifyAuth(request);
    const twilio = new Twilio.Twilio(env.TWILIO_SID(), env.TWILIO_AUTH_TOKEN());
    const url = new URL(request.url);
    const params = url.searchParams;
    const areaCode = params.get('areaCode')
    try {
        const listParams = areaCode ? { areaCode: Number(areaCode), limit: 10 } : { limit: 10 };
        const locals = await twilio.availablePhoneNumbers('CA').local.list(listParams as any)
        return new Response(JSON.stringify(locals), {
            headers: {
                "Content-Type": "application/json"
            },
            status: 200
        })

    } catch (error) {
        logger.error('Fetching numbers failed', error);
        return new Response(JSON.stringify({ error }), {
            headers: {
                'Content-Type': 'application/json'
            },
            status: 500
        });
    }
}
