import { json, useActionData, redirect } from '@remix-run/react';
import { createSupabaseServerClient } from '../supabase.server';

export const action = async ({ request }) => {
    const formData = await request.formData();
    const email = formData.get('email');
    const password = formData.get('password');
    const {supabaseClient:supabase, headers} = createSupabaseServerClient(request);
    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
        return json({ error: error.message }, {headers});
    }

    if (data.user) {
        return redirect('/signin');
    }
};

export default function SignUp() {
    const actionData = useActionData();

    return (
        <div>
            <h1>Sign Up</h1>
            {actionData?.error && <p style={{ color: 'red' }}>{actionData.error}</p>}
            <form method="post">
                <div>
                    <label htmlFor="email">Email:</label>
                    <input type="email" id="email" name="email" required />
                </div>
                <div>
                    <label htmlFor="password">Password:</label>
                    <input type="password" id="password" name="password" required />
                </div>
                <button type="submit">Sign Up</button>
            </form>
        </div>
    );
}
