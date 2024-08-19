import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";

export const action = async ({ request, params }) => {
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
        ...workspace!inner(twilio_data)`,
      )
      .eq("phone_number", data.To)
      .single();
  
    if (number) {
      const media = [];
      const now = new Date();
  
      for (let i = 0; i < parseInt(data.NumMedia); i++) {
        try {
          const mediaResponse = await fetch(
            data[`MediaUrl${i}`],
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
              contentType: data[`MediaContentType${i}`],
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
        .ilike("phone", data.From) 
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
        num_media: parseInt(data.NumMedia),
        num_segments: parseInt(data.NumSegments),
        workspace: number.workspace,
        direction: "inbound",
        date_created: now,
        date_sent: now,
        status: "received",
        ...(media.length > 0 && {inbound_media: media}),
        ...(contact && contact.length > 0 && { contact_id: contact[0].id }),
      };
  
      const { data: message, error: messageError } = await supabase
        .from("message")
        .insert(messageData)
        .select();
  
      if (messageError) {
        console.error('Message insert error:', messageError);
        return json({ messageError }, 400);
      }
      return json({ message }, 201);
    } else {
      return json({ error: "Number not found" }, 404);
    }
  };
