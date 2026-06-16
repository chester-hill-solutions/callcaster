import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveTwilioSmsMessagingServiceSid } from "../_shared/sms-send-resolve.ts";

const basePortal = {
  sendMode: "from_number" as const,
  messagingServiceSid: null as string | null,
};

Deno.test("resolveTwilioSmsMessagingServiceSid prefers explicit request SID", () => {
  assertEquals(
    resolveTwilioSmsMessagingServiceSid({
      explicitRequestSid: "MGREQ",
      campaignSmsSendMode: "from_number",
      campaignSmsMessagingServiceSid: "MGCAMP",
      portalConfig: {
        sendMode: "messaging_service",
        messagingServiceSid: "MGPORTAL",
      },
    }),
    "MGREQ",
  );
});

Deno.test("resolveTwilioSmsMessagingServiceSid uses campaign then portal MS", () => {
  assertEquals(
    resolveTwilioSmsMessagingServiceSid({
      explicitRequestSid: null,
      campaignSmsSendMode: "messaging_service",
      campaignSmsMessagingServiceSid: "MGCAMP",
      portalConfig: {
        sendMode: "messaging_service",
        messagingServiceSid: "MGPORTAL",
      },
    }),
    "MGCAMP",
  );

  assertEquals(
    resolveTwilioSmsMessagingServiceSid({
      explicitRequestSid: null,
      campaignSmsSendMode: "messaging_service",
      campaignSmsMessagingServiceSid: null,
      portalConfig: {
        sendMode: "messaging_service",
        messagingServiceSid: "MGPORTAL",
      },
    }),
    "MGPORTAL",
  );
});

Deno.test("resolveTwilioSmsMessagingServiceSid from_number blocks portal MS", () => {
  assertEquals(
    resolveTwilioSmsMessagingServiceSid({
      explicitRequestSid: null,
      campaignSmsSendMode: "from_number",
      campaignSmsMessagingServiceSid: "MGCAMP",
      portalConfig: {
        sendMode: "messaging_service",
        messagingServiceSid: "MGPORTAL",
      },
    }),
    null,
  );
});

Deno.test("resolveTwilioSmsMessagingServiceSid legacy null mode follows portal", () => {
  assertEquals(
    resolveTwilioSmsMessagingServiceSid({
      explicitRequestSid: null,
      campaignSmsSendMode: null,
      campaignSmsMessagingServiceSid: null,
      portalConfig: {
        sendMode: "messaging_service",
        messagingServiceSid: "MGPORTAL",
      },
    }),
    "MGPORTAL",
  );
});
