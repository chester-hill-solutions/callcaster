import { json, redirect } from "@remix-run/node";
import { NavLink, Outlet, useLoaderData, useOutlet } from "@remix-run/react";
import { useMemo, useState, useEffect } from "react";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { Button } from "~/components/ui/button";
import {
  getMedia,
  getRecordingFileNames,
  getSignedUrls,
  getUserRole,
  getWorkspaceScripts,
  listMedia,
} from "~/lib/database.server";
import { MemberRole } from "~/components/Workspace/TeamMember";
import {ScriptPreview} from "~/components/ScriptPreview";

export const loader = async ({ request, params }) => {
  const { id: workspace_id, selected_id } = params;

  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession?.user) {
    return redirect("/signin");
  }

  const userRole = getUserRole({ serverSession, workspaceId: workspace_id });
  const scripts = await getWorkspaceScripts({
    workspace: workspace_id,
    supabase: supabaseClient,
  });

  const { data: campaignData, error: campaignError } = await supabaseClient
    .from("campaign")
    .select(`*, campaign_audience(*)`)
    .eq("id", selected_id)
    .single();

  if (campaignError) {
    console.error(campaignError);
    throw new Response("Error fetching campaign data", { status: 500 });
  }

  let campaignDetails, mediaNames;

  switch (campaignData.type) {
    case "live_call":
    case null:
      ({ data: campaignDetails } = await supabaseClient
        .from("live_campaign")
        .select(`*, script(*)`)
        .eq("campaign_id", selected_id)
        .single());
      mediaNames = await listMedia(supabaseClient, workspace_id);
      break;

    case "message":
      ({ data: campaignDetails } = await supabaseClient
        .from("message_campaign")
        .select()
        .eq("campaign_id", selected_id)
        .single());
      if (campaignDetails?.message_media?.length > 0) {
        campaignDetails.mediaLinks = await getSignedUrls(
          supabaseClient,
          workspace_id,
          campaignDetails.message_media,
        );
      }
      break;

    case "robocall":
    case "simple_ivr":
    case "complex_ivr":
      ({ data: campaignDetails } = await supabaseClient
        .from("ivr_campaign")
        .select(`*, script(*)`)
        .eq("campaign_id", selected_id)
        .single());
      const fileNames = getRecordingFileNames(campaignDetails.step_data);
      campaignDetails.mediaLinks = await getMedia(
        fileNames,
        supabaseClient,
        workspace_id,
      );
      mediaNames = await listMedia(supabaseClient, workspace_id);
      break;

    default:
      throw new Response("Invalid campaign type", { status: 400 });
  }

  return json({
    workspace_id,
    selected_id,
    data: { ...campaignData, campaignDetails },
    mediaNames,
    userRole,
    scripts,
  });
};

export default function ScriptPage() {
  const { workspace_id, selected_id, mediaNames, scripts, data, userRole } =
    useLoaderData();
    
  const outlet = useOutlet();
  const [selectedImage, setSelectedImage] = useState(null);
  const clickImage = (e) => {
    setSelectedImage(e.target.src);
  };
  const closePopover = () => {
    setSelectedImage(null);
  };
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        closePopover();
      }
    };

    if (selectedImage) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [selectedImage]);
  return (
    <div className="relative flex h-full flex-col">
      <div className="my-1 flex flex-col gap-2 px-2 relative">
        {!outlet && userRole !== MemberRole.Caller && (
          <div className="m-4 absolute" style={{top:'-78px', right: 0}}>
            <Button asChild>
              <NavLink to={"edit"}>Edit </NavLink>
            </Button>
            </div>
        )}
        {(data.type !== "message" || !data.type) && !outlet ? (
          <ScriptPreview pageData={data}/>
        ) : data.type === "message" && !outlet ? (
          <div className="flex flex-col items-center">
            <h3 className="font-Zilla-Slab text-2xl">Your Campaign Message.</h3>

            <div className="mx-auto flex max-w-sm flex-col gap-2 rounded-lg bg-green-100 p-4 shadow-md">
              {!outlet && (data.body_text || data.message_media) ? (
                <div className="flex flex-wrap justify-between">
                  {data.campaignDetails.mediaLinks?.length > 0 &&
                    data.campaignDetails.mediaLinks.map((img, i) => (
                      <img
                        onClick={clickImage}
                        id={data.message_media[i]}
                        key={data.message_media[i]}
                        src={img}
                        alt={`${data.message_media[i]}`}
                        className="mb-2 rounded-lg"
                        width={"45%"}
                      />
                    ))}
                  <div className="text-sm leading-snug text-gray-700">
                    {data.body_text}
                  </div>
                  {selectedImage && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                      <div className="relative max-h-full max-w-full">
                        <img
                          src={selectedImage}
                          alt="Enlarged"
                          className="max-h-full max-w-full rounded-lg p-5"
                        />
                        <button
                          onClick={closePopover}
                          className="absolute right-2 top-2 rounded-full bg-white p-2 text-gray-700 hover:text-gray-900 focus:outline-none"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-6 w-6"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div>Get started on your campaign message.</div>
                </div>
              )}
            </div>
          </div>
        ) : !outlet && (
          <div>An error occured.</div>
        )}
        <Outlet />
      </div>
    </div>
  );
}
