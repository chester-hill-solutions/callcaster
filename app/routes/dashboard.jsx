import {
  Link,
  json,
  redirect,
  useLoaderData,
  useOutletContext,
} from "@remix-run/react";
import { getSupabaseServerClientWithUser } from "~/lib/supabase.server";

export const loader = async ({ request }) => {
  const { supabaseClient, headers, user, workspace } = await getSupabaseServerClientWithUser(request);
  console.log(workspace)
  if (!workspace) {
    return redirect('/select-workspace');
  }
  const { data: campaigns = [], error } = await supabaseClient
    .from('campaign')
    .select()
    .eq('workspace', workspace);
    console.log(campaigns)
  return json({ campaigns, headers });
};

const Dashboard = () => {
  const { env, twilioDevice } = useOutletContext();
  const { campaigns } = useLoaderData();
  return (
    <main className="flex h-screen w-full flex-col items-center py-8 text-white">
      <div className="flex flex-col gap-4 rounded-md bg-gray-50 p-6 text-lg text-black shadow-md">
        <h1 className="text-5xl font-bold">Campaign Time</h1>
        {campaigns && campaigns.length > 0 ? (
          <div className="mt-8">
            <h3 className="text-2xl font-semibold">Campaigns</h3>
            <ul className="mt-4 flex flex-col gap-4">
              {campaigns.map(campaign => (
                <li key={campaign.id}>
                  <Link
                    to={`/campaign/${campaign.id}`}
                    className="block rounded-md bg-gray-200 px-4 py-2 text-xl font-semibold text-gray-800 transition duration-150 ease-in-out hover:bg-gray-800 hover:text-gray-200"
                  >
                    {campaign.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-8 text-xl">No campaigns available.</p>
        )}
      </div>
    </main>
  );
};

export default Dashboard;
