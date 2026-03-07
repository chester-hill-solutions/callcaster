import { SupabaseClient } from '@supabase/supabase-js';
import {
  createWorkspaceTwilioInstance,
  getWorkspaceTwilioPortalConfig,
  requireWorkspaceAccess,
  safeParseJson,
} from '../lib/database.server';
import { Database } from '@/lib/database.types';
import { verifyApiKeyOrSession } from '@/lib/api-auth.server';
import { normalizePhoneNumber, processTemplateTags } from '@/lib/utils';
import { logger } from '@/lib/logger.server';
import { env } from '@/lib/env.server';
import { processUrls } from '@/lib/sms.server';
import type { TwilioMessageIntent, WorkspaceTwilioOpsConfig } from '@/lib/types';

function parseOptionalString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolveSmsRequest({
    body,
    to,
    from,
    media,
    portalConfig,
    messagingServiceSid,
    messageIntent,
}: {
    body: string;
    to: string;
    from: string;
    media: string[];
    portalConfig: WorkspaceTwilioOpsConfig;
    messagingServiceSid?: string | null;
    messageIntent?: TwilioMessageIntent | null;
}) {
    const resolvedMessagingServiceSid =
        messagingServiceSid ??
        (portalConfig.sendMode === "messaging_service" ? portalConfig.messagingServiceSid : null);
    const resolvedMessageIntent = messageIntent ?? portalConfig.defaultMessageIntent;

    return {
        body,
        to,
        statusCallback: `${env.SUPABASE_URL()}/functions/v1/sms-status`,
        ...(media.length > 0 && { mediaUrl: [...media] }),
        ...(resolvedMessagingServiceSid
            ? { messagingServiceSid: resolvedMessagingServiceSid }
            : { from }),
        ...(resolvedMessageIntent ? { messageIntent: resolvedMessageIntent } : {}),
    };
}

export const sendMessage = async ({
    body,
    to,
    from,
    media,
    supabase,
    workspace,
    contact_id,
    user,
    portalConfig,
    messageIntent,
    messagingServiceSid,
}: {
    body: string,
    to: string,
    from: string,
    media: string,
    supabase: SupabaseClient<Database>,
    workspace: string,
    contact_id: string,
    user: { id: string } | null,
    portalConfig?: WorkspaceTwilioOpsConfig,
    messageIntent?: TwilioMessageIntent | null,
    messagingServiceSid?: string | null,
}) => {
    const mediaData = media && JSON.parse(media);
    const resolvedPortalConfig =
        portalConfig ??
        await getWorkspaceTwilioPortalConfig({ supabaseClient: supabase, workspaceId: workspace });
    const twilio = await createWorkspaceTwilioInstance({ supabase, workspace_id: workspace });
    try {
        // Process URLs in the message body to shorten them
        const processedBody = await processUrls(body);
        
        const message = await twilio.messages.create(
            resolveSmsRequest({
                body: processedBody,
                to,
                from,
                media: mediaData && mediaData.length > 0 ? [...mediaData] : [],
                portalConfig: resolvedPortalConfig,
                messagingServiceSid,
                messageIntent,
            })
        );

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
            const webhookData = webhook[0];
            if (webhookData) {
                const webhookResponse = await fetch(webhookData.destination_url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(webhookData.custom_headers && typeof webhookData.custom_headers === 'object' ?
                            Object.entries(webhookData.custom_headers).reduce((acc, [key, value]) => ({
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
                if (!webhookResponse.ok) {
                    logger.error(`Webhook request failed with status ${webhookResponse.status}`);
                    throw new Error(`Error with the webhook event: ${webhookResponse.statusText}`);
                }
                
            }
        }
        return { message, data, webhook };
    } catch (error) {
        logger.error("Error sending message:", error);
        throw new Error("Failed to send message");
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

    const {
        to_number,
        workspace_id,
        contact_id,
        caller_id,
        body,
        media,
        message_intent,
        messaging_service_sid,
    } = await safeParseJson<{
        to_number: string;
        workspace_id: string;
        contact_id: string;
        caller_id: string;
        body: string;
        media: string;
        message_intent?: string;
        messaging_service_sid?: string;
    }>(request);

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
    const portalConfig = await getWorkspaceTwilioPortalConfig({ supabaseClient: supabase, workspaceId: workspace_id });
    const messageIntent =
        typeof message_intent === "string" && message_intent.trim()
            ? (message_intent.trim() as TwilioMessageIntent)
            : null;
    const messagingServiceSid = parseOptionalString(messaging_service_sid);

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
            user,
            portalConfig,
            messageIntent,
            messagingServiceSid,
        });
        return new Response(JSON.stringify({ data, message }), {
            headers: {
                'Content-Type': 'application/json'
            },
            status: 201
        });
    } catch (error) {
        logger.error("Error in chat_sms action:", error);
        return new Response(JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to send message",
        }), {
            headers: {
                'Content-Type': 'application/json'
            },
            status: 500
        });
    }
};
