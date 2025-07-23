import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { createWorkspaceTwilioInstance } from '../lib/database.server';
import { Database } from '~/lib/database.types';
import { verifyAuth } from '~/lib/supabase.server';
import { processTemplateTags } from '~/lib/utils';

// Link shortening function using TinyURL API
async function shortenUrl(url: string): Promise<string> {
  try {
    const response = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
    if (response.ok) {
      const shortenedUrl = await response.text();
      return shortenedUrl;
    }
  } catch (error) {
    console.error('Error shortening URL:', error);
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

export const sendMessage = async ({ body, to, from, media, supabase, workspace, contact_id, user }: { body: string, to: string, from: string, media: string, supabase: SupabaseClient<Database>, workspace: string, contact_id: string, user: User }) => {
    const mediaData = media && JSON.parse(media);
    const twilio = await createWorkspaceTwilioInstance({ supabase, workspace_id: workspace });
    try {
        // Process URLs in the message body to shorten them
        const processedBody = await processUrls(body);
        
        const message = await twilio.messages.create({
            body: processedBody,
            to,
            from,
            statusCallback: `${process.env.BASE_URL}/api/sms/status`,
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
            console.error('Error fetching webhook:', webhook_error);
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
                    console.error(`Webhook request failed with status ${webhook_response.status}`);
                    throw new Error(`Error with the webhook event: ${webhook_response.statusText}`);
                }
                
            }
        }
        return { message, data, webhook };
    } catch (error) {
        console.log(`Error sending message: ${error}`);
        return { error: 'Failed to send message' };
    }
};

export const action = async ({ request }: { request: Request }) => {
    const { supabaseClient, user } = await verifyAuth(request);
    const { to_number, workspace_id, contact_id, caller_id, body, media } = await request.json() as { to_number: string, workspace_id: string, contact_id: string, caller_id: string, body: string, media: string };
    let to;
    try {
        to = normalizePhoneNumber(to_number);
    } catch (error) {
        console.error('Invalid phone number:', error);
        return new Response(JSON.stringify({ error }), {
            headers: {
                'Content-Type': 'application/json'
            },
            status: 404
        });
    }

    try {
        // Fetch contact data for template tag processing
        let processedBody = body || " ";
        if (contact_id && body) {
            const { data: contact, error: contactError } = await supabaseClient
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
            supabase: supabaseClient,
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
        console.log(error);
        return new Response(JSON.stringify({ error }), {
            headers: {
                'Content-Type': 'application/json'
            },
            status: 400
        });
    }
};
