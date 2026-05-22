// @ts-nocheck
import { data as routeData, ActionFunction } from "react-router";
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { WorkspaceNumbers } from '@/lib/types';



import { readTwilioWorkspaceCredentials } from '@/lib/twilio-workspace-credentials';

interface FormData {
  VerificationStatus: string;
  To: string;
  [key: string]: string;
}

interface Capabilities {
  fax: boolean;
  mms: boolean;
  sms: boolean;
  voice: boolean;
  verification_status: string;
  emergency_address_status: string;
  emergency_address_sid: string | null;
  emergency_eligible: boolean;
  emergency_compliance_status: string;
}

export const action: ActionFunction = async ({ request }) => {
  const { env } = await import("@/lib/env.server");
  const { logger } = await import("@/lib/logger.server");
  const { validateTwilioWebhookParams } = await import("@/twilio.server");

  const formData = await request.formData();
  const parsedBody: FormData = Object.fromEntries(formData) as FormData;

  const supabase: SupabaseClient = createClient(
    env.SUPABASE_URL(),
    env.SUPABASE_SERVICE_KEY()
  );

  try {
    const { data: candidateNumbers, error: candidateError } = await supabase
      .from('workspace_number')
      .select('workspace(twilio_data)')
      .eq('phone_number', parsedBody.To);

    if (candidateError) {
      throw new Error(`Database error: ${candidateError.message}`);
    }

    const isValidTwilioRequest = (candidateNumbers ?? []).some((row) => {
      const twilioData = (row as { workspace?: { twilio_data?: unknown } }).workspace
        ?.twilio_data;
      const creds = readTwilioWorkspaceCredentials(twilioData);
      return (
        creds != null &&
        validateTwilioWebhookParams(
          parsedBody,
          request.headers.get('x-twilio-signature'),
          request.url,
          creds.authToken,
        )
      );
    });

    if (!isValidTwilioRequest) {
      return routeData({ error: 'Invalid Twilio signature' }, { status: 403 });
    }

    if (parsedBody.VerificationStatus === 'success' || parsedBody.VerificationStatus === 'failed') {
      const capabilities: Capabilities = {
        fax: false,
        mms: parsedBody.VerificationStatus === 'success',
        sms: parsedBody.VerificationStatus === 'success',
        voice: parsedBody.VerificationStatus === 'success',
        verification_status: parsedBody.VerificationStatus,
        emergency_address_status: 'not_started',
        emergency_address_sid: null,
        emergency_eligible: false,
        emergency_compliance_status: 'not_started',
      };

      const { data: numberRequest, error: numberError } = await supabase
        .from('workspace_number')
        .update({ capabilities })
        .eq('phone_number', parsedBody.To)
        .select();

      if (numberError) {
        throw new Error(`Database error: ${numberError.message}`);
      }

      if (!numberRequest || numberRequest.length === 0) {
        throw new Error('No matching record found');
      }

      return routeData(numberRequest[0]);
    }

    return routeData(parsedBody);
  } catch (error) {
    logger.error('Error processing request:', error);
    return routeData({ error: 'An error occurred while processing the request' }, { status: 500 });
  }
};