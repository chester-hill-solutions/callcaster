import { json } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";

export const action = async ({ request, params }) => {
  const formData = await request.formData();
  const data = Object.fromEntries(formData);
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  );
  console.log(data)
  return json(data);
};
