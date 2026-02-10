import { SupabaseClient } from '@supabase/supabase-js';
import { createWorkspaceTwilioInstance, requireWorkspaceAccess, safeParseJson } from '../lib/database.server';
import { Database } from '@/lib/database.types';
import { verifyApiKeyOrSession } from '@/lib/api-auth.server';
import { processTemplateTags } from '@/lib/utils';
import { logger } from '@/lib/logger.server';
import { env } from '@/lib/env.server';

// Link shortening function using TinyURL API
async function shortenUrl(url: string): Promise<string> {
  try {
    const response = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
    if (response.ok) {
      const shortenedUrl = await response.text();
      return shortenedUrl;
    }
  } catch (error) {
    logger.error('Error shortening URL:', error);
  }
  return url; // Return original URL if shortening fails
}

// Process URLs in text and shorten them
async function processUrls(text: string): Promise<string> {
  // Regex to match URLs
  const urlRegex = /https?:\/\/[^\s]+/g;
  
  let processedText = text;
  const urlMatches = text.match(urlRegex);
  
  if (urlMatches) {
    for (const url of urlMatches) {
      const shortenedUrl = await shortenUrl(url);
      processedText = processedText.replace(url, shortenedUrl);
    }
  }
  
  return processedText;
}

const normalizePhoneNumber = (input: string) => {
    let cleaned = input.replace(/[^0-9+]/g, '');

    cleaned = cleaned.indexOf('+') > 0 ? cleaned.replace(/\+/g, '') : cleaned;
    cleaned = !cleaned.startsWith('+') ? '+' + cleaned : cleaned;

    const validLength = 11;
    const minLength = 11;

    cleaned = cleaned.length < minLength + 1 ? '+1' + cleaned.replace('+', '') : cleaned;

    if (cleaned.length !== validLength + 1) {
        throw new Error('Invalid phone number length');
    }

    return cleaned;
};

export const sendMessage = async ({ body, to, from, media, supabase, workspace, contact_id, user }: { body: string, to: string, from: string, media: string, supabase: SupabaseClient<Database>, workspace: string, contact_id: string, user: { id: string } | null }) => {
    const mediaData = media && JSON.parse(media);
    const twilio = await createWorkspaceTwilioInstance({ supabase, workspace_id: workspace });
    try {
        // Process URLs in the message body to shorten them
        const processedBody = await processUrls(body);
        
        const message = await twilio.messages.create({
            body: processedBody,
            to,
            from,
            statusCallback: `${env.BASE_URL()}/api/sms/status`,
            ...(mediaData && mediaData.length > 0 && { mediaUrl: [...mediaData] })
        });

        const {
            sid,
            body: sentBody,
            numSegments: num_segments,
            direction,
            from: sentFrom,
            to: sentTo,
            dateUpdated: date_updated,
            price = 0,
            errorMessage: error_message,
            uri,
            accountSid: account_sid,
            numMedia: num_media,
            status,
            messagingServiceSid: messaging_service_sid,
            dateSent: date_sent,
            dateCreated: date_created,
            errorCode: error_code,
            priceUnit: price_unit,
            apiVersion: api_version,
            subresourceUris: subresource_uris,
        } = message;

        const { data, error } = await supabase.from('message').insert({
            sid,
            body: sentBody,
            num_segments,
            direction,
            from: sentFrom,
            to: sentTo,
            date_updated,
            price: (price || null),
            error_message,
            account_sid,
            uri,
            num_media,
            status,
            messaging_service_sid,
            date_sent,
            date_created,
            error_code,
            price_unit,
            api_version,
            subresource_uris,
            workspace,
            ...(contact_id && { contact_id }),
            ...(mediaData && mediaData.length > 0 && { outbound_media: [...mediaData] })
        }).select();

        if (error) throw { 'message_entry_error:': error };
        const { data: webhook, error: webhook_error } = await supabase
            .from('webhook')
            .select('*')
            .eq('workspace', workspace)
            .filter('events', 'cs', '[{"category":"outbound_sms"}]');
        if (webhook_error) {
            logger.error('Error fetching webhook:', webhook_error);
            throw { 'webhook_error:': webhook_error };
        }
        if (webhook && webhook.length > 0) {
            const webhook_data = webhook[0];
            if (webhook_data) {
                const webhook_response = await fetch(webhook_data.destination_url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(webhook_data.custom_headers && typeof webhook_data.custom_headers === 'object' ?
                            Object.entries(webhook_data.custom_headers).reduce((acc, [key, value]) => ({
                                ...acc,
                                [key]: String(value)
                            }), {}) : {})
                    },
                    body: JSON.stringify({
                        event_category: 'outbound_sms',
                        event_type: 'outbound_sms',
                        workspace_id: workspace,
                        timestamp: new Date().toISOString(),
                        payload: { type: 'outbound_sms', record: message, old_record: null }
                    }),
                });
                if (!webhook_response.ok) {
                    logger.error(`Webhook request failed with status ${webhook_response.status}`);
                    throw new Error(`Error with the webhook event: ${webhook_response.statusText}`);
                }
                
            }
        }
        return { message, data, webhook };
    } catch (error) {
        logger.error(`Error sending message: ${error}`);
        return { error: 'Failed to send message' };
    }
};

export const action = async ({ request }: { request: Request }) => {
    const authResult = await verifyApiKeyOrSession(request);

    if ("error" in authResult) {
        return new Response(JSON.stringify({ error: authResult.error }), {
            headers: { "Content-Type": "application/json" },
            status: authResult.status,
        });
    }

    const { to_number, workspace_id, contact_id, caller_id, body, media } = await safeParseJson<{ to_number: string; workspace_id: string; contact_id: string; caller_id: string; body: string; media: string }>(request);

    if (authResult.authType === "api_key") {
        if (workspace_id !== authResult.workspaceId) {
            return new Response(JSON.stringify({ error: "workspace_id does not match API key" }), {
                headers: { "Content-Type": "application/json" },
                status: 403,
            });
        }
    } else {
        await requireWorkspaceAccess({ supabaseClient: authResult.supabaseClient, user: authResult.user, workspaceId: workspace_id });
    }

    let to;
    try {
        to = normalizePhoneNumber(to_number);
    } catch (error) {
        logger.error('Invalid phone number:', error);
        return new Response(JSON.stringify({ error }), {
            headers: {
                'Content-Type': 'application/json'
            },
            status: 404
        });
    }

    const supabase = authResult.authType === "api_key" ? authResult.supabase : authResult.supabaseClient;
    const user = authResult.authType === "session" ? authResult.user : null;

    try {
        // Fetch contact data for template tag processing
        let processedBody = body || " ";
        if (contact_id && body) {
            const { data: contact, error: contactError } = await supabase
                .from("contact")
                .select("*")
                .eq("id", Number(contact_id))
                .single();

            if (!contactError && contact) {
                processedBody = processTemplateTags(body, contact);
            }
        }

        const { message, data } = await sendMessage({
            body: processedBody,
            media,
            to,
            from: caller_id,
            supabase,
            workspace: workspace_id,
            contact_id,
            user
        });
        return new Response(JSON.stringify({ data, message }), {
            headers: {
                'Content-Type': 'application/json'
            },
            status: 201
        });
    } catch (error) {
        logger.error("Error in chat_sms action:", error);
        return new Response(JSON.stringify({ error }), {
            headers: {
                'Content-Type': 'application/json'
            },
            status: 400
        });
    }
};
