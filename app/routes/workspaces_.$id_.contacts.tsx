import { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  Form,
  Link,
  NavLink,
  json,
  useActionData,
  useLoaderData,
  useNavigate,
  useSearchParams,
} from "@remix-run/react";
import { MdDownload, MdEdit } from "react-icons/md";
import { paginatedContactColumns } from "~/components/Contacts/columns";
import WorkspaceNav from "~/components/Workspace/WorkspaceNav";
import { DataTable } from "~/components/WorkspaceTable/DataTable";
import { contactColumns } from "~/components/WorkspaceTable/columns";
import { Button } from "~/components/ui/button";
import { PaginatedDataTable } from "~/components/ui/paginatedtable";
import { getUserRole } from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { formatDateToLocale } from "~/lib/utils";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  const { id: workspaceId } = params;
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const perPage = parseInt(url.searchParams.get("perPage") || "30", 10);

  if (workspaceId == null) {
    return json(
      {
        contacts: null,
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

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const {
    data: contacts,
    error: contactError,
    count,
  } = await supabaseClient
    .from("contact")
    .select("*", { count: "exact" })
    .eq("workspace", workspaceId)
    .range(from, to);
  if ([contactError, workspaceError].filter(Boolean).length) {
    return json(
      {
        contacts: null,
        error: [contactError, workspaceError]
          .filter(Boolean)
          .map((error) => error.message)
          .join(", "),
        userRole,
      },
      { headers },
    );
  }
  return json(
    {
      contacts,
      workspace,
      error: null,
      userRole,
      pagination: {
        page,
        perPage,
        total: count,
      },
    },
    { headers },
  );
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const formData = await request.formData();
  const data = Object.fromEntries(formData.entries());

  if (!data.id) {
    return json({ error: "Script ID is required" }, { status: 400 });
  }

  const { data: script, error: scriptError } = await supabaseClient
    .from("script")
    .select("name, steps")
    .eq("id", data.id)
    .single();

  if (scriptError) {
    console.error("Error fetching script:", scriptError);
    return json({ error: "Error fetching script" }, { status: 500 });
  }

  if (!script) {
    return json({ error: "Script not found" }, { status: 404 });
  }

  const scriptJson = JSON.stringify(script.steps, null, 2);

  const fileName = script.name
    ? `${script.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.json`
    : `callcaster_script_${new Date().toISOString().split("T")[0]}.json`;

  return json(
    {
      fileContent: scriptJson,
      fileName: fileName,
      contentType: "application/json",
    },
    {
      headers: {
        ...headers,
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Type": "application/json",
      },
    },
  );
}

export default function WorkspaceContacts() {
  const { contacts, error, userRole, workspace, pagination } =
    useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const handlePageChange = (newPage: number, newPerPage: number) => {
    searchParams.set("page", newPage.toString());
    searchParams.set("perPage", newPerPage.toString());
    navigate(`?${searchParams.toString()}`);
  };

  /*     const actionData = useActionData<typeof action>();
  
    useEffect(() => {
      if (actionData) {
          console.log(actionData)
        const blob = new Blob([actionData.fileContent], { type: actionData.contentType });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", actionData.fileName);
        document.body.appendChild(link);
        link.click();
        link.parentNode.removeChild(link);
      }
    }, [actionData]); */

  const isWorkspaceAudioEmpty = !contacts?.length > 0;
  return (
    <main className="mx-auto mt-8 flex h-full w-[80%] flex-col gap-4 rounded-sm text-white">
      <WorkspaceNav workspace={workspace} userRole={userRole} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-[300px]">
          <h1 className="font-Zilla-Slab text-xl font-bold text-brand-primary dark:text-white">
            {workspace != null ? `${workspace?.name} Contacts` : "No Workspace"}
          </h1>
        </div>
        <div className="flex flex-1 items-center justify-center gap-4 sm:justify-end">
          <Button asChild className="font-Zilla-Slab text-xl font-semibold">
            <Link to={`./new`}>New Contact</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="border-0 border-black bg-zinc-600 font-Zilla-Slab text-xl font-semibold text-white hover:bg-zinc-300 dark:border-white"
          >
            <Link to=".." relative="path">
              Back
            </Link>
          </Button>
        </div>
      </div>
      {error && !isWorkspaceAudioEmpty && (
        <h4 className="text-center font-Zilla-Slab text-4xl font-bold text-red-500">
          {error}
        </h4>
      )}
      {isWorkspaceAudioEmpty && (
        <h4 className="py-16 text-center font-Zilla-Slab text-4xl font-bold text-black dark:text-white">
          Add Your Contacts to this Workspace!
        </h4>
      )}

      {contacts != null && (
        <div className="py-2 mb-8">
          <PaginatedDataTable
            className="rounded-md text-sm border-2 font-semibold text-gray-700 dark:border-white dark:text-white"
            data={contacts}
            columns={paginatedContactColumns}
            pagination={pagination}
            onPageChange={handlePageChange}
          />
        </div>
      )}
    </main>
  );
}
