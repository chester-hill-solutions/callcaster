import { json } from "@remix-run/react"
import Twilio from 'twilio';


export const action = async ({ request }) => {

    return json({ success: true })
}

export const loader = async ({ request }) => {
    const url = new URL(request.url);
    const recordingUrl = url.searchParams.get('url');
    const twilio = new Twilio.Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
    try {
        const response = await twilio.request({
            method: 'GET',
            uri: recordingUrl,
        });
        if (response.statusCode !== 200) {
            throw new Error('Failed to fetch recording');
        }
        return new Response(response.body, {
            headers: {
                'Content-Type': response.headers['content-type'],
                'Content-Length': response.headers['content-length'],
            }
        });
    } catch (error) {
        console.error('Error fetching recording:', error);
        return json({ error: 'Failed to fetch recording' }, { status: 500 });
    }
};
