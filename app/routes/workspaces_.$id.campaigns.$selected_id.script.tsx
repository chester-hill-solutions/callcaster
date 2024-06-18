import { json, redirect } from "@remix-run/node";
import {
  NavLink,
  Outlet,
  useLoaderData,
  useOutlet,
  useOutletContext,
  useSubmit,
} from "@remix-run/react";
import { useMemo, useState, useEffect } from "react";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import CampaignSettingsScript from "../components/CampaignSettings.Script";
import { deepEqual } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { getUserRole } from "~/lib/database.server";
import { MemberRole } from "~/components/Workspace/TeamMember";

export const loader = async ({ request, params }) => {
  const { id: workspace_id, selected_id, selected } = params;

  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession?.user) {
    return redirect("/signin");
  }

  const userRole = getUserRole({ serverSession, workspaceId: workspace_id });

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
  const { audiences } = useOutletContext();
  const {
    workspace_id,
    selected_id,
    data = [],
    mediaData,
    userRole,
  } = useLoaderData();
  const submit = useSubmit();
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
  return (
    <div className="relative flex h-full flex-col">
      <div className="my-1 flex flex-col gap-2 px-2">
        {!outlet && userRole !== MemberRole.Caller && (
          <div className="flex flex-1 justify-end">
            <Button asChild>
              <NavLink to={"edit"}>Edit </NavLink>
            </Button>
          </div>
        )}
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
      </div>
      <Outlet />
    </div>
  );
}
