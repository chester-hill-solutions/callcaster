import { FaPlus } from "react-icons/fa";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { useMemo, useState, useEffect } from "react";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import CampaignSettingsScript from "../components/CampaignSettings.Script";
import { deepEqual } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { getUserRole } from "~/lib/database.server";
import { MessageSettings } from "../components/MessageSettings";
import { MdBubbleChart, MdMic } from "react-icons/md";
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
  }
  if (data.length > 0 && data[0].type === "message") {
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
  }
  if (
    data.length > 0 &&
    (data[0].type === "robocall" ||
      data[0].type === "simple_ivr" ||
      data[0].type === "complex_ivr")
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
      userRole,
    });
  } else {
    return json({
      workspace_id,
      selected_id,
      data,
      selected,
      userRole,
    });
  }
};

export const action = async ({ request, params }) => {
  const campaignId = params.selected_id;
  const formData = await request.formData();
  const mediaName = formData.get("fileName");
  const encodedMediaName = encodeURI(mediaName);

  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  const { data: campaign, error } = await supabaseClient
    .from("message_campaign")
    .select("id, message_media")
    .eq("campaign_id", campaignId)
    .single();
  if (error) {
    console.log("Campaign Error", error);
    return json({ success: false, error: error }, { headers });
  }
  const { data: campaignUpdate, error: updateError } = await supabaseClient
    .from("message_campaign")
    .update({
      message_media: campaign.message_media.filter(
        (med) => med !== encodedMediaName,
      ),
    })
    .eq("campaign_id", campaignId)
    .select();
  if (updateError) {
    console.log(updateError);
    return json({ success: false, error: updateError }, { headers });
  }
  return json({ success: false, error: updateError }, { headers });
};

export default function ScriptEditor() {
  const { workspace_id, selected_id, data = [] } = useLoaderData();
  const submit = useSubmit();
  const pageData = useMemo(() => data || [], [data]);
  const initQuestions = useMemo(() => {
    return pageData.length > 0 && pageData[0]?.campaignDetails?.questions
      ? [...pageData[0]?.campaignDetails?.questions]
      : [];
  }, [pageData]);
  const [questions, setQuestions] = useState(() => {
    return initQuestions.map((q, index) => ({ ...q, order: index }));
  });
  const [isChanged, setChanged] = useState(false);
  const [bodyText, setBodyText] = useState(pageData[0]?.body_text || "");
  const [openQuestion, setOpenQuestion] = useState(null);

  const handleSaveUpdate = () => {
    const campaign = data[0];
    const updateData = {
      campaign_id: campaign.id,
      ...campaign,
      questions,
    };
    submit(updateData, {
      method: "patch",
      encType: "application/json",
      navigate: false,
      action: "/api/campaigns",
    });
  };

  const handleReset = () => {
    setQuestions(initQuestions);
    setChanged(!deepEqual(questions, initQuestions));
  };
  const removeQuestion = (id) => {
    setQuestions((prevQuestions) =>
      prevQuestions.filter((question) => question.id !== id),
    );
    setChanged(!deepEqual(questions, initQuestions));
  };

  const addQuestion = () => {
    setQuestions((prevQuestions) => [
      ...prevQuestions,
      {
        id: `new-question-${questions.length + 1}`,
        title: "",
        type: "textarea",
        order: prevQuestions.length,
      },
    ]);
    setOpenQuestion(`new-question-${questions.length + 1}`);
    setChanged(!deepEqual(questions, initQuestions));
  };

  const moveUp = (index) => {
    if (index <= 0) return;
    const newQuestions = [...questions];
    [newQuestions[index], newQuestions[index - 1]] = [
      newQuestions[index - 1],
      newQuestions[index],
    ];
    newQuestions[index].order = index;
    newQuestions[index - 1].order = index - 1;
    setQuestions(newQuestions);
    setChanged(!deepEqual(questions, initQuestions));
  };

  const moveDown = (index) => {
    if (index >= questions.length - 1) return;
    const newQuestions = [...questions];
    [newQuestions[index], newQuestions[index + 1]] = [
      newQuestions[index + 1],
      newQuestions[index],
    ];
    newQuestions[index].order = index;
    newQuestions[index + 1].order = index + 1;
    setQuestions(newQuestions);
    setChanged(!deepEqual(questions, initQuestions));
  };

  const updateQuestion = (index, updatedQuestion) => {
    setQuestions((prevQuestions) => {
      const newQuestions = [...prevQuestions];
      if (updatedQuestion.id && updatedQuestion.id !== newQuestions[index].id) {
        const existingIndex = newQuestions.findIndex(
          (question) => question.id === updatedQuestion.id,
        );
        if (existingIndex !== -1) {
          throw new Error(`ID ${updatedQuestion.id} already exists`);
        }
      }
      newQuestions[index] = { ...newQuestions[index], ...updatedQuestion };
      return newQuestions;
    });
  };

  const dispatchState = (e) => {
    const quesIndex = questions.findIndex(
      (question) => question.id === e.oldState.id,
    );
    const updatedQuestion = e.newState;
    setOpenQuestion(e.newState.id);
    try {
      updateQuestion(quesIndex, updatedQuestion);
      setChanged(!deepEqual(e.newState, e.oldState));
    } catch (error) {
      console.error(error.message);
    }
  };

  useEffect(() => {
    setChanged(!deepEqual(questions, initQuestions));
  }, [initQuestions, questions]);
  console.log(pageData[0].campaignDetails.mediaLinks);
  return (
    <div className="relative flex h-full flex-col">
      {isChanged && (
        <div
          className="absolute flex w-full items-center justify-between bg-accent px-4 py-4"
          style={{ top: "-105px" }}
        >
          <Button onClick={handleReset} color="accent">
            Reset
          </Button>
          <div className="font-Zilla-Slab text-xl">
            You have unsaved changes
          </div>
          <Button onClick={handleSaveUpdate}>Save Changes</Button>
        </div>
      )}
      {pageData[0].type === "live_call" && (
        <CampaignSettingsScript
          {...{
            questions,
            addQuestion,
            removeQuestion,
            moveUp,
            moveDown,
            updateQuestion,
            openQuestion,
            setOpenQuestion,
            dispatchState,
          }}
        />
      )}
      {pageData.length > 0 &&
        (pageData[0].type === "robocall" ||
          pageData[0].type === "simple_ivr" ||
          pageData[0].type === "complex_ivr") && (
          <div>
            <div className="my-1 flex gap-2 px-2">
              <div
                className="flex flex-col"
                style={{
                  flex: "1 1 20%",
                  border: "3px solid #BCEBFF",
                  borderRadius: "20px",
                  boxShadow: "3px 5px 0  rgba(50,50,50,.6)",
                  minHeight: "300px",
                }}
              >
                <button
                  className="gap-2 bg-primary px-2 py-2 font-Zilla-Slab text-xl text-white"
                  onClick={addQuestion}
                  style={{
                    justifyContent: "center",
                    display: "flex",
                    alignItems: "center",
                    borderTopLeftRadius: "18px",
                    borderTopRightRadius: "18px",
                  }}
                >
                  Add Question
                  <FaPlus size="16px" />
                </button>
                {pageData[0].step_data.map((question) => {
                  return (
                    <button
                      key={question.id}
                      onClick={() =>
                        setOpenQuestion((curr) =>
                          curr === question.id ? null : question.id,
                        )
                      }
                      style={{ textAlign: "left", border: "1px solid #f1f1f1" }}
                      className={`px-2 hover:bg-accent ${openQuestion === question.id && "bg-brand-secondary"}`}
                    >
                      {question.step} - {question.name}
                    </button>
                  );
                })}
              </div>
              <div
                className="flex flex-wrap justify-center"
                style={{ flex: "1 1 80%", gap: "16px" }}
              >
                {pageData[0].step_data.map((question, index) => (
                  <div
                    key={index}
                    className="relative flex w-2/5 flex-col rounded-2xl bg-[hsl(var(--card))] p-6"
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-auto justify-between">
                        <div className="text-xl font-semibold">
                          {question.step} {question.name}
                        </div>
                        <div className="flex flex-col items-center text-xs uppercase">
                          {question.speechType === "synthetic" ? (
                            <MdBubbleChart size={24} />
                          ) : (
                            <MdMic size={24} />
                          )}
                          {question.speechType}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          {question.speechType === "synthetic" ? (
                            <div className="flex flex-col ">
                              <div className="font-medium">Script</div>
                              <div>{question.say}</div>
                            </div>
                          ) : (
                            <audio
                              src={
                                pageData[0].campaignDetails?.mediaLinks?.find(
                                  (media) =>
                                    Object.keys(media)[0] === question.say,
                                )?.[question.say]
                              }
                              controls
                            />
                          )}
                        </div>
                      </div>
                      {question.nextStep && (
                        <div className="mt-4 overflow-auto">
                          <table className="w-full table-auto divide-y">
                            <thead>
                              <tr>
                                <th className="px-4 py-2 text-left text-sm font-medium uppercase tracking-wider">
                                  {question.responseType === "dtmf"
                                    ? "Digit Entry"
                                    : question.responseType === "speech"
                                      ? "Speech"
                                      : question.responseType === "dtmf speech"
                                        ? "Digit Entry or Speech"
                                        : "No response requested."}
                                </th>
                                <th className="px-4 py-2 text-left text-sm font-medium uppercase tracking-wider">
                                  Next step
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {question.nextStep &&
                                Object.entries(question.nextStep).map(
                                  ([key, value]) => {
                                    const nextQuestion =
                                      pageData[0].step_data.find(
                                        (q) => q.step == value,
                                      );
                                    return (
                                      <tr key={key}>
                                        <td className="whitespace-nowrap px-4 py-2 text-sm">
                                          {key === "vx-any"
                                            ? "Audio Response"
                                            : key}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-2 text-sm">
                                          {nextQuestion?.step}
                                          {nextQuestion.name &&
                                            ` - ${nextQuestion.name}`}
                                        </td>
                                      </tr>
                                    );
                                  },
                                )}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {!question.nextStep && <div></div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      {pageData[0].type === "message" && (
        <MessageSettings
          {...{ pageData, submit, bodyText, setBodyText, workspace_id }}
        />
      )}
    </div>
  );
}
