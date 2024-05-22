import {
  useLoaderData,
  redirect,
  json,
  useOutletContext,
  useSubmit,
  useNavigate,
  useLocation,
} from "@remix-run/react";
import { createSupabaseServerClient } from "../lib/supabase.server";
//import { CampaignLink } from '../components/DashboardLinks';

export const loader = async ({ request }) => {
  const { supabaseClient: supabase, headers } =
    createSupabaseServerClient(request);
  const { data, error } = await supabase.auth.getSession();
  if (!data.session) {
    return redirect("/signin");
  }
  const { data: campaigns, error: listsError } = await supabase
    .from("campaign")
    .select();
  return json({ session: data.session, campaigns }, { headers });
};
export const action = async ({ request }) => {
  const { supabaseClient: supabase, headers } =
    createSupabaseServerClient(request);
  return supabase;
};
const Dashboard = () => {
  const { campaigns } = useLoaderData();
  // TODO: List out all campaigns in the workspace
  return (
    <div className="dashboardContainer">
      <div className="columnStyle">
        <h1>Campaign Time</h1>
        {campaigns && campaigns.length > 0 && (
          <div className="columnStyle gap1">
            <h3>Campaigns</h3>
            {/* {campaigns.map(campaign => <CampaignLink key={campaign.id} list={campaign}/>)} */}
          </div>
        )}
        {/* <div className='columnStyle gap1'>
                    <h3>Wards</h3>
                    {wards.map(ward => <WardLink key={ward} ward={ward} />)}
                </div> */}
      </div>
    </div>
  );
};

export default Dashboard;
