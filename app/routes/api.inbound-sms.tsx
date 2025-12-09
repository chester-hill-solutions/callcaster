import { json, ActionFunctionArgs } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import { sendWebhookNotification } from "@/lib/workspace-settings/WorkspaceSettingUtils";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  );
  const formData = await request.formData();
  const data = Object.fromEntries(formData);
  const { data: number, error: numberError } = await supabase
    .from("workspace_number")
    .select(
      `
        workspace,
        ...workspace!inner(twilio_data, webhook(*))`,
    )
    .eq("phone_number", data.To)
    .single();

  if (number) {
    const media = [];
    const now = new Date();
    for (let i = 0; i < parseInt(data.NumMedia as string); i++) {
      try {
        const mediaResponse = await fetch(
          data[`MediaUrl${i}`] as string,
          {
            headers: {
              Authorization: `Basic ${Buffer.from(`${number.twilio_data.sid}:${number.twilio_data.authToken}`).toString("base64")}`,
            },
          },
        );

        if (!mediaResponse.ok) {
          throw new Error(`Failed to fetch media: ${mediaResponse.statusText}`);
        }

        const newMedia = await mediaResponse.blob();
        const fileName = `${number.workspace}/sms-${data.MessageSid}-${i}-${now.toISOString()}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("messageMedia")
          .upload(fileName, newMedia, {
            cacheControl: "60",
            upsert: false,
            contentType: data[`MediaContentType${i}`] as string,
          });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          continue;
        }
        media.push(uploadData?.path);
      } catch (error) {
        console.error(`Error processing media ${i}:`, error);
      }
    }

    const { data: contact, error: contactError } = await supabase
      .from("contact")
      .select("id")
      .ilike("phone", data.From as string)
      .eq("workspace", number.workspace);

    if (contactError) {
      console.error('Contact lookup error:', contactError);
    }

    const messageData = {
      sid: data.MessageSid,
      account_sid: data.AccountSid,
      body: data.Body,
      from: data.From,
      to: data.To,
      num_media: parseInt(data.NumMedia as string),
      num_segments: parseInt(data.NumSegments as string),
      workspace: number.workspace,
      direction: "inbound",
      date_created: now,
      date_sent: now,
      status: "received",
      ...(media.length > 0 && { inbound_media: media }),
      ...(contact && contact.length > 0 && { contact_id: contact[0].id }),
    };

    const { data: message, error: messageError } = await supabase
      .from("message")
      .insert(messageData)
      .select();

    if ((data.Body as string).toLowerCase() === "stop" || (data.Body as string).toLowerCase() === '"stop"') {
      const { data: contact, error: contactError } = await supabase
        .from("contact")
        .select("id")
        .ilike("phone", data.From as string)
        .eq("workspace", number.workspace);

      if (contactError) {
        console.error('Contact lookup error:', contactError);
      }

      if (contact && contact.length > 0) {
        await supabase.from("contact").update({
          opt_out: true,
        }).in("id", contact.map((c) => c.id));
      }
    } else if ((data.Body as string).toLowerCase() === "start" || (data.Body as string).toLowerCase() === '"start"') {
      const { data: contact, error: contactError } = await supabase
        .from("contact")
        .select("id")
        .ilike("phone", data.From as string)
        .eq("workspace", number.workspace);

      if (contactError) {
        console.error('Contact lookup error:', contactError);
      }

      if (contact && contact.length > 0) {
        await supabase.from("contact").update({
          opt_out: false,
        }).in("id", contact.map((c) => c.id));
      }
    }

    if (messageError) {
      console.error('Message insert error:', messageError);
      return json({ messageError }, 400);
    }
    const smsWebhook = number.webhook.map((webhook: any) => webhook.events.filter((event: any) => event.category === "inbound_sms")).flat()
    if (smsWebhook.length > 0) {
      await sendWebhookNotification({
        eventCategory: "inbound_sms",
        eventType: "INSERT",
        workspaceId: number.workspace,
        payload: {
          message_sid: data.MessageSid,
          from: data.From,
          to: data.To,
          body: data.Body,
          status: data.Status,
          num_media: parseInt(data.NumMedia as string),
          media_urls: media.length > 0 ? media : null,
          timestamp: now.toISOString(),
        },
        supabaseClient: supabase,
      });
    }

    return json({ message }, 201);
  } else {
    return json({ error: "Number not found" }, 404);
  }
};
