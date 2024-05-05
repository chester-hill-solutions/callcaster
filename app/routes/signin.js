import { json, redirect } from '@remix-run/node';
import { useActionData } from '@remix-run/react';
import { createSupabaseServerClient } from '../supabase.server';

export const action = async ({ request }) => {
    const { supabaseClient, headers } = createSupabaseServerClient(request);

    const formData = await request.formData();

    const email = formData.get('email');
    const password = formData.get('password');

    const { user, error } = await supabaseClient.auth.signInWithPassword({ email, password })

    if (!error) {
        return redirect('/dashboard', { headers });
    } else {
        console.log(error);
        return json({ error: error.message })
    }
}
export const loader = async ({ request }) => {
    const { supabaseClient, headers } = createSupabaseServerClient(request);
    const {data }= supabaseClient.auth.getSession();
    console.log(data)
    return json({data}, {headers})
}


export default function SignIn() {
    const actionData = useActionData();
    return (
        <div>
            <h1>Sign In</h1>
            {actionData?.error && <p style={{ color: 'red' }}>{actionData.error}</p>}
            <form method='post'>
                <label htmlFor="email">Email</label>
                <input type="email" id="email" name="email" required />

                <label htmlFor="password">Password</label>
                <input type="password" id="password" name="password" required />

                <button type="submit">Sign In</button>
            </form>
        </div>
    );
}
