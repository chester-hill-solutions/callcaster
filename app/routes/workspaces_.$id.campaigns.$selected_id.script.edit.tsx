import { json, redirect } from "@remix-run/node";
import { useLoaderData, useOutletContext, useSubmit } from "@remix-run/react";
import { useMemo, useState, useEffect } from "react";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import CampaignSettingsScript from "../components/CampaignSettings.Script";
import { deepEqual } from "~/lib/utils";
import { Button } from "~/components/ui/button";

export const loader = async ({ request, params }) => {
  const { id: workspace_id, selected_id, selected } = params;

  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession?.user) {
    return redirect("/signin");
  }
  if (selected_id === "new") {
    const query = supabaseClient
      .from("campaign")
      .insert({ workspace: workspace_id })
      .select();
    const { data, error } = await query;
    if (error) {
      console.log(error);
      return redirect(`/workspaces/${workspace_id}`);
    }

    const { error: detailsError } = await supabaseClient
      .from("live_campaign")
      .insert({ campaign_id: data[0].id, workspace: workspace_id });
    return redirect(`/workspaces/${workspace_id}/campaign/${data[0].id}`);
  }
  const { data: mtmData, error: mtmError } = await supabaseClient
    .from("campaign")
    .select(
      `*,
        campaign_audience(*)
        `,
    )
    .eq("id", selected_id);
  let data = [...mtmData];
  if (data.length > 0 && data[0].type === "live_call") {
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
  }
  const { data: mediaData, error: mediaError } = await supabaseClient.storage
    .from("workspaceAudio")
    .list(workspace_id);

  return json({ workspace_id, selected_id, data, selected, mediaData });
};

export default function ScriptEditor() {
  const { workspace_id, selected_id, data = [], mediaData } = useLoaderData();
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
  }, [initQuestions]);
  console.log(questions)
  return (
    <div className="relative flex h-full flex-col">
      {isChanged && (
        <div
          className="absolute flex w-full items-center justify-between bg-accent px-4 py-2"
          style={{ top: "-65px" }}
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
    </div>
  );
}