import { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  Form,
  Link,
  NavLink,
  json,
  useActionData,
  useLoaderData,
} from "@remix-run/react";
import { MdDownload, MdEdit } from "react-icons/md";
import WorkspaceNav from "~/components/Workspace/WorkspaceNav";
import { DataTable } from "~/components/WorkspaceTable/DataTable";
import { Button } from "~/components/ui/button";
import { getUserRole } from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { formatDateToLocale } from "~/lib/utils";
import { Contact, ContactAudience, Audience, WorkspaceData } from "~/lib/types";
import { PostgrestError } from "@supabase/supabase-js";

type ContactWithAudiences = Contact & { audiences: (Partial<ContactAudience> & { audience_name: Partial<Audience> })[] }

type LoaderData = {
  contacts: ContactWithAudiences[],
  workspace: WorkspaceData,
  error: string | null,
  userRole: string | null,
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const workspaceId = params.id;
  if (workspaceId == null) {
    return json(
      {
        audioMedia: null,
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

  const { data: contacts, error: contactError }: {
    data: ContactWithAudiences[],
    error: PostgrestError
  } = await supabaseClient
    .from("contact")
    .select(`
      *,
      audiences:contact_audience!inner(
        audience_id,
        audience_name:audience!inner(name)
      )
    `)
    .eq("workspace", workspaceId)
    .eq("audiences.audience.workspace", workspaceId);
      console.log(contacts[0].audiences)
  const flattenedContacts = contacts?.map(contact => ({
    ...contact,
    audience_names: contact.audiences.map(a => a.audience_name.name)
  }));
  //console.log(flattenedContacts)
  if ([contactError, workspaceError].filter(Boolean).length) {
    return json(
      {
        scripts: null,
        error: [contactError, workspaceError]
          .filter(Boolean)
          .map((error) => error.message)
          .join(", "),
        userRole,
      },
      { headers },
    );
  }

  return json({ contacts: flattenedContacts, workspace, error: null, userRole }, { headers });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  return null;
}

export default function WorkspaceContacts() {
  const { contacts, error, userRole, workspace } =
    useLoaderData<typeof loader>();

  const isWorkspaceAudioEmpty = !contacts?.length > 0;
  return (
    <main className="mx-auto mt-8 flex h-full w-[80%] flex-col gap-4 rounded-sm text-white">
      <WorkspaceNav
        workspace={workspace}
        isInChildRoute={true}
        userRole={userRole}
      />
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-Zilla-Slab text-3xl font-bold text-brand-primary dark:text-white">
          {workspace != null
            ? `${workspace?.name} Contacts`
            : "No Workspace"}
        </h1>
        <div className="flex items-center gap-4">
          <Button asChild className="font-Zilla-Slab text-xl font-semibold">
            <Link to={`./new`}>Add Contact</Link>
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
          Add Your Own Contacts to this Workspace!
        </h4>
      )}

      {contacts != null && (
        <DataTable
          className="rounded-md border-2 font-semibold text-gray-700 dark:border-white dark:text-white"
          data={contacts}
          columns={[
            {
              accessorKey: "firstname",
              header: "First",
            },
            {
              accessorKey: "surname",
              header: "Last",
            },
            {
              accessorKey: "phone",
              header: "Phone Number",
            },
            {
              accessorKey: "email",
              header: "Email Address",
            },
            {
              accessorKey: "address",
              header: "Street Address",
            },
            {
              accessorKey: "city",
              header: "City",
            },
            {
              header: "Audiences",
              cell: ({ row }) => {
                const audienceIds = row.original.audience_ids || [];
                const audienceNames = row.original.audience_names || [];
                return (
                  <div>
                    {audienceNames.map((name, index) => (
                      <span key={audienceIds[index]} className="inline-block bg-gray-200 rounded-full px-2 py-1 text-xs font-semibold text-gray-700 mr-1 mb-1">
                        {name}
                        </span>
                      ))}
                  </div>
                );
              },
            },
            {
              header: "Other Data",
              cell: ({ row }) => {
                return (
                  <div>
                    {row.original.other_data?.map((item, i) => {
                      return (
                        <div key={`${row.id}-other-data-${i}`}>
                          {Object.keys(item)}: {Object.values(item)}
                        </div>
                      );
                    })}
                  </div>
                );
              },
            },
            {
              accessorKey: "created_at",
              header: "Created",
              cell: ({ row }) => {
                const formatted = formatDateToLocale(
                  row.getValue("created_at"),
                );
                return <div className="">{formatted.split(",")[0]}</div>;
              },
            },
            {
              header: "Edit",
              cell: ({ row }) => {
                const id = row.original.id;
                return (
                  <Button variant="ghost" asChild>
                    <NavLink to={`./${id}`} relative="path">
                      <MdEdit />
                    </NavLink>
                  </Button>
                );
              },
            },
          ]}
        />
      )}
    </main>
  );
}
