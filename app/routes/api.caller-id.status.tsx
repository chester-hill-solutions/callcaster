import { json, ActionFunction } from '@remix-run/node';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { WorkspaceNumbers } from '~/lib/types';

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
}

export const action: ActionFunction = async ({ request }) => {
  const formData = await request.formData();
  const parsedBody: FormData = Object.fromEntries(formData);

  const supabase: SupabaseClient = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  try {
    if (parsedBody.VerificationStatus === 'success' || parsedBody.VerificationStatus === 'failed') {
      const capabilities: Capabilities = {
        fax: false,
        mms: parsedBody.VerificationStatus === 'success',
        sms: parsedBody.VerificationStatus === 'success',
        voice: parsedBody.VerificationStatus === 'success',
        verification_status: parsedBody.VerificationStatus
      };

      const { data: numberRequest, error: numberError } = await supabase
        .from<WorkspaceNumbers>('workspace_number')
        .update({ capabilities })
        .eq('phone_number', parsedBody.To)
        .select();

      if (numberError) {
        throw new Error(`Database error: ${numberError.message}`);
      }

      if (!numberRequest || numberRequest.length === 0) {
        throw new Error('No matching record found');
      }

      return json(numberRequest[0]);
    }

    return json(parsedBody);
  } catch (error) {
    console.error('Error processing request:', error);
    return json({ error: 'An error occurred while processing the request' }, { status: 500 });
  }
};