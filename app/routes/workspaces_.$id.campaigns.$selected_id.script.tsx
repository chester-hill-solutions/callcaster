import { json, redirect } from "@remix-run/node";
import { NavLink, Outlet, useLoaderData, useOutlet } from "@remix-run/react";
import { useMemo, useState, useEffect } from "react";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { Button } from "~/components/ui/button";
import { getUserRole } from "~/lib/database.server";
import { MemberRole } from "~/components/Workspace/TeamMember";
import { IVRSettings } from "~/components/IVRSettings";

export const loader = async ({ request, params }) => {
  const { id: workspace_id, selected_id, selected } = params;

  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession?.user) {
    return redirect("/signin");
  }
  function getRecordingFileNames(data) {
    const fileNames = data.map((obj) => {
      if (obj.speechType === "recorded") {
        return obj.say;
      }
    });
    return fileNames.filter(Boolean);
  }
  async function getMedia(fileNames: Array<string>) {
    const media = await Promise.all(
      fileNames.map(async (mediaName) => {
        const { data, error } = await supabaseClient.storage
          .from("workspaceAudio")
          .createSignedUrl(`${workspace_id}/${mediaName}`, 3600);
        if (error) throw error;
        return { [mediaName]: data.signedUrl };
      }),
    );

    return media;
  }

  const userRole = getUserRole({ serverSession, workspaceId: workspace_id });

  const { data: mtmData, error: mtmError } = await supabaseClient
    .from("campaign")
    .select(
      `*,
        campaign_audience(*)
        `,
    )
    .eq("id", selected_id);
  const { data: mediaData, error: mediaError } = await supabaseClient.storage
    .from("workspaceAudio")
    .list(workspace_id);

  let data = [...mtmData];
  if (
    data.length > 0 &&
    (data[0].type === "live_call" || data[0].type === null)
  ) {
    const { data: campaignDetails, error: detailsError } = await supabaseClient
      .from("live_campaign")
      .select()
      .eq("campaign_id", selected_id)
      .single();
    if (detailsError) console.error(detailsError);

    data = data.map((item) => ({
      ...item,
      campaignDetails,
    }));
    return json({
      workspace_id,
      selected_id,
      data,
      selected,
      mediaData,
      userRole,
    });
  } else if (data.length > 0 && data[0].type === "message") {
    let media;
    const { data: campaignDetails, error: detailsError } = await supabaseClient
      .from("message_campaign")
      .select()
      .eq("campaign_id", selected_id)
      .single();
    if (detailsError) console.error(detailsError);
    if (campaignDetails.message_media.length > 0) {
      media = await Promise.all(
        campaignDetails.message_media.map(async (mediaName) => {
          const { data, error } = await supabaseClient.storage
            .from("messageMedia")
            .createSignedUrl(`${workspace_id}/${mediaName}`, 3600);
          if (error) throw error;
          return data.signedUrl;
        }),
      );
    }
    data = data.map((item) => ({
      ...item,
      ...campaignDetails,
      campaignDetails: { mediaLinks: media },
    }));
    return json({
      workspace_id,
      selected_id,
      data,
      selected,
      mediaData,
      userRole,
    });
  } else if (
    data[0].type === "robocall" ||
    data[0].type === "simple_ivr" ||
    data[0].type === "complex_ivr"
  ) {
    const { data: campaignDetails, error: detailsError } = await supabaseClient
      .from("ivr_campaign")
      .select()
      .eq("campaign_id", selected_id)
      .single();
    if (detailsError) console.error(detailsError);
    const fileNames = getRecordingFileNames(campaignDetails.step_data);
    let media = [];
    if (fileNames.length > 0) {
      media = await getMedia(fileNames);
    }
    data = data.map((item) => ({
      ...item,
      ...campaignDetails,
      campaignDetails: { mediaLinks: media },
    }));
    return json({
      workspace_id,
      selected_id,
      data,
      selected,
      mediaData,
      userRole,
    });
  } else {
    return json({
      workspace_id,
      selected_id,
      data,
      selected,
      mediaData,
      userRole,
    });
  }
};

export default function ScriptPage() {
  const { data = [], userRole } = useLoaderData();

  const outlet = useOutlet();
  const pageData = useMemo(() => data || [], [data]);
  const initQuestions = useMemo(() => {
    return pageData.length > 0 && pageData[0]?.campaignDetails?.questions
      ? [...pageData[0]?.campaignDetails?.questions]
      : [];
  }, [pageData]);
  const [questions, setQuestions] = useState(() => {
    return initQuestions.map((q, index) => ({ ...q, order: index }));
  });
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
      <div className="my-1 flex flex-col gap-2 px-2">
        {!outlet && userRole !== MemberRole.Caller && (
          <div className="m-4 flex flex-1 justify-end">
            <Button asChild>
              <NavLink to={"edit"}>Edit </NavLink>
            </Button>
          </div>
        )}
        {pageData[0].type === "live_call" && !outlet ? (
          <div className="flex flex-col gap-2">
            {!outlet && questions.length > 0 ? (
              questions.map((question) => (
                <div key={question.id} className="flex flex-col px-2">
                  <div className="font-Zilla-Slab text-lg">
                    {question.title || question.id}
                  </div>
                  <div className="text-sm">{question.text}</div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center">
                <div>Get started on your campaign Script and survey.</div>
              </div>
            )}
          </div>
        ) : pageData[0].type === "live_call" && !outlet ? (
          <div className="flex flex-col items-center">
            <h3 className="font-Zilla-Slab text-2xl">Your Campaign Message.</h3>

            <div className="mx-auto flex max-w-sm flex-col gap-2 rounded-lg bg-green-100 p-4 shadow-md">
              {!outlet &&
              (pageData[0].body_text || pageData[0].message_media) ? (
                <div className="flex flex-wrap justify-between">
                  {pageData[0].campaignDetails.mediaLinks?.length > 0 &&
                    pageData[0].campaignDetails.mediaLinks.map((img, i) => (
                      <img
                        onClick={clickImage}
                        id={pageData[0].message_media[i]}
                        key={pageData[0].message_media[i]}
                        src={img}
                        alt={`${pageData[0].message_media[i]}`}
                        className="mb-2 rounded-lg"
                        width={"45%"}
                      />
                    ))}
                  <div className="text-sm leading-snug text-gray-700">
                    {pageData[0].body_text}
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
        ) : (
          !outlet && <IVRSettings pageData={pageData} onChange={() => null} />
        )}
        <Outlet context={pageData}/>
      </div>
    </div>
  );
}
