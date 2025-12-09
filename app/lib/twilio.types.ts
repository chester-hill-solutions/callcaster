/**
 * Type definitions for Twilio webhook payloads and API responses
 */

import type { Database } from "./database.types";

/**
 * Twilio SMS status webhook payload
 */
export interface TwilioSmsStatusWebhook {
  SmsSid: string;
  SmsStatus: TwilioSmsStatus;
  MessageSid?: string;
  AccountSid?: string;
  From?: string;
  To?: string;
  MessageStatus?: string;
}

/**
 * Valid Twilio SMS status values
 * These map to the message_status enum in the database
 */
export type TwilioSmsStatus =
  | "accepted"
  | "scheduled"
  | "canceled"
  | "queued"
  | "sending"
  | "sent"
  | "failed"
  | "delivered"
  | "undelivered"
  | "receiving"
  | "received"
  | "read";

/**
 * Twilio inbound call webhook payload
 */
export interface TwilioInboundCallWebhook {
  CallSid: string;
  AccountSid: string;
  Called: string;
  From: string;
  To: string;
  Direction: "inbound" | "outbound-api" | "outbound-call" | "outbound-reply";
  CallStatus: Database["public"]["Enums"]["call_status"];
  ApiVersion: string;
  Duration?: string;
  CallDuration?: string;
}

/**
 * Outreach attempt disposition values
 * These are string values used for tracking call/message outcomes
 */
export type OutreachDisposition =
  | "completed"
  | "failed"
  | "busy"
  | "no-answer"
  | "canceled"
  | "voicemail"
  | "voicemail-no-message"
  | "answered"
  | TwilioSmsStatus; // SMS statuses can also be dispositions

/**
 * Webhook event type
 */
export interface WebhookEvent {
  category: "inbound_call" | "outbound_call" | "outbound_sms" | "inbound_sms";
  type: "INSERT" | "UPDATE" | "DELETE";
}

/**
 * Webhook configuration from database
 */
export interface WebhookConfig {
  id: string;
  workspace: string;
  destination_url: string;
  events: WebhookEvent[];
  custom_headers?: Record<string, string> | null;
}

