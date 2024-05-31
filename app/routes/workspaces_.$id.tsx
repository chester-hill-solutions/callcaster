import { LoaderFunctionArgs } from "@remix-run/node";
import {
  json,
  redirect,
  useLoaderData,
  useNavigate,
  Form,
  Link,
} from "@remix-run/react";
import { useRef } from "react";

import { DataTable } from "~/components/WorkspaceTable/DataTable";
import { campaignColumns } from "~/components/WorkspaceTable/columns";
import { Button } from "~/components/ui/button";
import { getWorkspaceCampaigns, getWorkspaceInfo } from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  if (!serverSession) {
    return redirect("/signin", { headers });
  }

  const workspaceId = params.id;
  if (workspaceId == null) {
    return json({ error: "Workspace does not exist" });
  }

  const { data: workspace, error: workspaceError } = await getWorkspaceInfo({
    supabaseClient,
    workspaceId,
  });

  const { data: campaigns, error: campaignsError } =
    await getWorkspaceCampaigns({
      supabaseClient,
      workspaceId,
    });

  if (campaigns == null) {
    return json({ error: "No campaigns found in workspace" });
  }

  for (const campaign of campaigns) {
    // console.log(`//////////////////// CAMPAIGN ${campaign.id} ////////////////////`,);
    const { data: contacts, error: contactError } = await supabaseClient.rpc(
      "get_contacts_by_campaign",
      { selected_campaign_id: campaign.id },
    );
    const { data: calls, error: callsError } = await supabaseClient.rpc(
      "get_calls_by_campaign",
      { selected_campaign_id: campaign.id },
    );

    let completedCalls = 0;
    let totalCalls = 0;

    for (const contact of contacts) {
      const calledContact = calls?.find(
        (call) => call.contact_id === contact.id,
      );

      // console.log(campaign.id,"     ",calledContact?.contact_id,calledContact?.status,);
      if (calledContact) {
        totalCalls += 1;
        if (calledContact.status === "completed") {
          completedCalls += 1;
        }
      }
    }
    const progress = completedCalls / totalCalls;
    campaign["progress"] = progress;
  }

  return json({ workspace, workspaceId, campaigns }, { headers });
};

export default function Workspace() {
  const { workspace, workspaceId, campaigns } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const teamsDialog = useRef<HTMLDialogElement>(null);

  return (
    <main className="mx-auto mt-8 flex h-full w-[80%] flex-col gap-4 rounded-sm text-white">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-Zilla-Slab text-3xl font-bold text-brand-primary dark:text-white">
          {workspace.name}
        </h1>
        <Button asChild>
          <Link to={`/workspaces/${workspaceId}/settings`} className="text-xl">
            Settings
          </Link>
        </Button>
      </div>
      {campaigns != null && (
        <DataTable
          className="rounded-md border-2 font-semibold text-gray-700 dark:border-white dark:text-white"
          columns={campaignColumns}
          data={campaigns}
          onRowClick={(item) => navigate(`campaigns/${item.id}`)}
        />
      )}
    </main>
  );
}

{
  /* <dialog
        id="teams-dialog"
        className="rounded-md border-2 border-brand-primary bg-white bg-opacity-100 text-black shadow-none"
        ref={teamsDialog}
      >
        <div
          id="teams-dialog-container"
          className="flex flex-col items-center px-16 pb-10 pt-8"
        >
          <h3 className="mb-4 font-Zilla-Slab text-4xl font-bold">
            Manage Team Members
          </h3>

          <p className="self-start text-lg font-bold text-black">Owner</p>
          <div
            id="team-owner"
            className="mb-4 flex w-full gap-2 rounded-md border-2 border-black p-2 text-xl"
          >
            <div className="aspect-square w-8 rounded-full bg-brand-primary" />
            <p className="font-semibold">Some Owner</p>
          </div>

          <p className="self-start text-lg font-bold">Members</p>
          <ul className="mb-4 flex w-full flex-col items-center gap-2">
            <li className="w-full">
              <TeamMember
                memberName="Some Admin"
                memberRole={MemberRole.Admin}
              />
            </li>

            <li className="w-full">
              <TeamMember
                memberName="Some Member"
                memberRole={MemberRole.Member}
              />
            </li>

            <li className="w-full">
              <TeamMember
                memberName="Some Caller"
                memberRole={MemberRole.Caller}
              />
            </li>
          </ul>
          <p className="font-bold text-black">Add New Member</p>
          <Sheet>
            <SheetTrigger asChild>
              <Button className="h-fit w-full border-2 border-black bg-transparent">
                <IoPersonAdd size="32px" className="" color="black" />
              </Button>
            </SheetTrigger>
            <SheetContent
              className="z-[100] bg-white dark:bg-inherit"
              onInteractOutside={(event) => event.preventDefault()}
            >
              <SheetHeader>
                <SheetTitle>Invite a Team Member</SheetTitle>
                <SheetDescription>
                  Enter a username or use the search function to add a new
                  member to your workspace team.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 flex w-full flex-col gap-4">
                <label
                  htmlFor="username"
                  className="flex w-full flex-col font-Zilla-Slab text-lg font-semibold dark:text-white"
                >
                  User Name
                  <input
                    type="text"
                    name="username"
                    id="username"
                    className="rounded-md border border-black bg-transparent px-4 py-2 dark:border-white"
                  />
                </label>

                <label
                  htmlFor="username"
                  className="flex w-full flex-col font-Zilla-Slab text-lg font-semibold dark:text-white"
                >
                  <div className="flex items-center gap-2">
                    <FaSearch size="16px" />
                    Search
                  </div>
                  <input
                    type="text"
                    name="username"
                    id="username"
                    className="rounded-md border border-black bg-transparent px-4 py-2 dark:border-white"
                  />
                </label>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </dialog> */
}
