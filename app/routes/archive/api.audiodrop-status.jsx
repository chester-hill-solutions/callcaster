
export const action = async ({ request }) => {
    const formData = await request.formData();
    const baseUrl = process.env.BASE_URL
    const url = new URL(request.url);
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SKEY);
    const CallSid = formData.get('CallSid');
    const AnsweredBy = formData.get('AnsweredBy');
    try {
        let { data, error } = await supabase.from('calls').select('*').eq('id', CallSid).single();

        if (error || !data) {
            const { data: newData, error: newDataError } = await supabase.from('calls').insert({ id: CallSid, responses: {"answered_by": AnsweredBy} });
            if (newDataError) throw newDataError;
        }
    } catch (e) {
        console.error('Error processing the call:', e);
    }

    return new Response({ status: 'OK' })
}