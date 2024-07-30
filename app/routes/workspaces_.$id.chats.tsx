import { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  Form,
  Link,
  NavLink,
  Outlet,
  json,
  useActionData,
  useLoaderData,
  useOutletContext,
} from "@remix-run/react";
import { MdAdd, MdDownload, MdEdit } from "react-icons/md";
import WorkspaceNav from "~/components/Workspace/WorkspaceNav";
import { DataTable } from "~/components/WorkspaceTable/DataTable";
import { Button } from "~/components/ui/button";
import { getUserRole } from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { formatDateToLocale } from "~/lib/utils";
import { useEffect } from "react";
import { Card } from "~/components/ui/card";
import { CardContent } from "~/components/CustomCard";
import { useConversationSummaryRealTime } from "~/hooks/useChatRealtime";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const workspaceId = params.id;
  if (workspaceId == null) {
    return json(
      {
        workspace: null,
        error: "Workspace does not exist",
        userRole: null,
      },
      { headers },
    );
  }

  const userRole = getUserRole({ serverSession, workspaceId });
  const { data: workspace, error: workspaceError } = await supabaseClient
    .from("workspace")
    .select()
    .eq("id", workspaceId)
    .single();

  const { data: chats, error: chatsError } = await supabaseClient.rpc(
    "get_conversation_summary",
    { p_workspace: workspaceId },
  );

  if ([chatsError, workspaceError].filter(Boolean).length) {
    return json(
      {
        scripts: null,
        error: [chatsError, workspaceError]
          .filter(Boolean)
          .map((error) => error.message)
          .join(", "),
        userRole,
      },
      { headers },
    );
  }
  return json({ chats, workspace, error: null, userRole }, { headers });
}

export default function ChatsList() {
  const context = useOutletContext();
  const { chats, workspace, userRole } = useLoaderData();

  const { conversations } = useConversationSummaryRealTime({
    supabase: context.supabase,
    initial: chats,
    workspace: workspace.id,
  });

  return (
    <main className="mx-auto mt-8 flex h-full w-[95%] gap-4">
      <Card className="flex h-full flex-col space-y-0 rounded-sm sm:w-[250px]">
        <Button
          className="flex flex-auto rounded-none rounded-t-sm text-lg"
          asChild
        >
          <NavLink to={"new"}>
            New Chat <MdAdd size={24} />
          </NavLink>
        </Button>
        <div>
          {conversations?.length > 0 &&
            conversations.map((chat, index) => {
              return (
                <Button
                  key={index}
                  asChild
                  className={`flex flex-auto rounded-none bg-transparent text-black hover:text-white ${index + 1 === chats.length && "rounded-b-sm"}`}
                >
                  <NavLink
                    to={chat.contact_phone}
                    className={`relative flex flex-auto border-2 border-t-0 ${chat.unread_count > 0 ? "border-primary" : "border-[#333]"}`}
                  >
                    <div>{chat.contact_phone}</div>
                    {chat.unread_count > 0 && (
                      <div className="absolute right-2">
                        ({chat.unread_count})
                      </div>
                    )}
                  </NavLink>
                </Button>
              );
            })}
        </div>
      </Card>
      <Card className="flex max-h-[800px] w-full flex-1 flex-col overflow-scroll rounded-sm">
        <Outlet context={context} />
      </Card>
    </main>
  );
}
