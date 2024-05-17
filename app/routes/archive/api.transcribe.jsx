import { json } from "@remix-run/node";

async function transcribeAudio(audioBuffer) {
    const openAiUrl = 'https://api.openai.com/v1/audio/transcriptions';
    const response = await fetch(openAiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model: "whisper-1",
            audio: {
                data: audioBuffer,
                encoding: "WAV",
                sample_rate_hertz: 16000,
                language_code: "en-US"
            },
            response_format:"json"
        })
    });
    return response.json();
}

export const action = async ({ request }) => {
    const baseUrl = process.env.BASE_URL
    const formData = await request.formData();
    const text = formData.get('TranscriptionText');
    console.log(request, text)
 /*    const audioFile = formData.get('audio');
    if (!audioFile || typeof audioFile !== 'File') {
        return new Response("Invalid audio data", { status: 400 });
    }

    const buffer = await audioFile.arrayBuffer();
    try {
        const transcriptionResult = await transcribeAudio(buffer); */
        return json({ status: 'OK' });
   /*  } catch (error) {
        console.error('Error transcribing audio:', error);
        return new Response("Failed to transcribe audio", { status: 500 });
    } */
};
