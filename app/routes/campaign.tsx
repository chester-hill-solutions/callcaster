import { json } from "@remix-run/node";
import { Outlet, useOutletContext } from "@remix-run/react";

export const loader = async ({ request }) => {
  return json({ success: true });
};

export default function CampaignWrapper() {
  const { twilioDevice, supabase } = useOutletContext();
  return (
    <main className="flex h-screen w-full flex-col items-center py-8 text-white">
      <div className="mt-8 flex flex-col gap-4 rounded-md bg-gray-50 p-6 text-lg text-black shadow-md">
        <Outlet context={{ twilioDevice, supabase }} />
      </div>
    </main>
  );
}
