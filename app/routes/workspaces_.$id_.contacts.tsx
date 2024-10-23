import { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { parse } from "csv-parse/sync";
import {
  Form,
  Link,
  NavLink,
  json,
  useActionData,
  useFetcher,
  useLoaderData,
} from "@remix-run/react";
import { MdDownload, MdEdit, MdUpload } from "react-icons/md";
import WorkspaceNav from "~/components/Workspace/WorkspaceNav";
import { DataTable } from "~/components/WorkspaceTable/DataTable";
import { Button } from "~/components/ui/button";
import { getUserRole } from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { formatDateToLocale, parseCSV } from "~/lib/utils";
import { Contact, ContactAudience, Audience, WorkspaceData } from "~/lib/types";
import { PostgrestError } from "@supabase/supabase-js";
import { createPGliteDb, createPGliteTable, insertContacts, getContacts } from "~/lib/pglite-utils";
import { ChangeEvent } from "react";
import ContactsTable from "~/components/ContactsTable";

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
        contacts: [],
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
  const { records, rowHeaders, valueTypes } = await request.json()
  const format = rowHeaders.map(header => `${header} ${valueTypes[rowHeaders.indexOf(header)]}`).join(', ');
  console.log(format, records);
  const db = await createPGliteDb(params.id as string);
  await createPGliteTable(db, 'contact', format as string);
  await insertContacts(db, 'contact', format as string, records as Record<string, string>[]);    
  const allContacts = await getContacts(db, 'contact', params.id as string);
  return allContacts.rows;
}

export default function WorkspaceContacts() {
  const { contacts, error, userRole, workspace } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const handleAudienceUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file?.type.includes('csv')) {
      return;
    } 
    if (file) {
      const fileContent = await file.text();
      const records = parse(fileContent);
      const rowHeaders = records[0];

      const valueTypes = records.slice(1, 26).reduce((acc: ('numeric' | 'boolean' | 'text' | 'date' | 'timestamp')[], row: string[] ) => {
        row.forEach((value, index) => {
          if (acc[index] === undefined) {
            if (!isNaN(Number(value))) acc[index] = 'numeric';
            else if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') acc[index] = 'boolean';
            else if (value.match(/^\d{4}-\d{2}-\d{2}$/)) acc[index] = 'date';
            else if (value.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) acc[index] = 'timestamp';
            else acc[index] = 'text';
          } else if (acc[index] === 'numeric' && isNaN(Number(value))) {
            acc[index] = 'text';
          }
        });
        return acc;
      }, [] as ('numeric' | 'boolean' | 'text' | 'date' | 'timestamp')[]);

      const data = {records, rowHeaders, valueTypes}
      fetcher.submit(data, { method: 'post', encType: 'application/json' })
    }
  }

  const isContactsEmpty = contacts?.length === 0;
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
          <fetcher.Form method="post">
            <Button variant="outline" asChild>
              <label htmlFor="contacts-upload" className="cursor-pointer">
                <MdUpload />  
            </label>
            </Button>
            <input type="file" id="contacts-upload" className="hidden" accept=".csv" onChange={handleAudienceUpload}/>
          </fetcher.Form>
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
      {fetcher.data && <ContactsTable contacts={fetcher.data as Contact[]} />}
      {error && !isContactsEmpty && (
        <h4 className="text-center font-Zilla-Slab text-4xl font-bold text-red-500">
          {error}
        </h4>
      )}
      {isContactsEmpty && (
        <h4 className="py-16 text-center font-Zilla-Slab text-4xl font-bold text-black dark:text-white">
          Add Your Own Contacts to this Workspace!
        </h4>
      )}

      {!isContactsEmpty && (
        <ContactsTable contacts={contacts} />
      )}
    </main>
  );
}
