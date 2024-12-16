import { ActionFunctionArgs, json } from "@remix-run/node";
import { Form, Link, useActionData, useOutletContext } from "@remix-run/react";
import { parse } from "csv-parse/sync";

import { useState } from "react";
import { MdAdd, MdClose } from "react-icons/md";
import { Card, CardContent, CardTitle } from "~/components/CustomCard";
import { Button } from "~/components/ui/button";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { Contact } from "~/lib/types";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "~/components/ui/table";

import { handleNewAudience } from "~/lib/WorkspaceSelectedNewUtils/WorkspaceSelectedNewUtils";

export async function action({ request, params }: ActionFunctionArgs) {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const workspaceId = params.id;

  if (workspaceId == null) {
    return json(
      {
        audienceData: null,
        campaignAudienceData: null,
        error: "Workspace not found",
      },
      { headers },
    );
  }

  const formData = await request.formData();
  const formAction = formData.get("formAction") as string;
  const contactsFile = formData.get("contacts") as File;

  if (!formData.get("audience-name")) {
    return json(
      {
        success: false,
        error: "Audience name is required",
      },
      { headers },
    );
  }
  switch (formAction) {
    case "newAudience": {
      return handleNewAudience({
        supabaseClient,
        formData,
        workspaceId,
        headers,
        contactsFile,
      });
    }
    default:
      break;
  }

  return json({ error: "Form Action not recognized" }, { headers });
}
const VALID_HEADERS = ["firstname", "surname", "phone", "email", "opt_out", "address", "city", "province", "postal", "country", "carrier", "other_data"];
// Parse CSV with columns option for better mapping
const parseCSV = (csvString: string) => {
  try {
    const records = parse(csvString, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const headers = parseCSVHeaders(Object.keys(records[0] || {}));
    const contacts = parseCSVData(records, headers);
    console.log(contacts)
    return { headers, contacts };
  } catch (error) {
    console.error("Error parsing CSV:", error);
    throw new Error("Failed to parse CSV file");
  }
};

const parseCSVHeaders = (unparsedHeaders: string[]) => {
  return unparsedHeaders.map((header) => header.toLowerCase().trim());
};

const parseCSVData = (records: Record<string, any>[], headers: string[]) => {
  return records.map((record) => {
    const contact = {};
    headers.forEach((header) => {
      const recordKey = Object.keys(record).find(
        key => key.toLowerCase() === header.toLowerCase()
      );
      contact[header] = recordKey ? record[recordKey] : "";
    });
    return contact;
  });
};

export default function AudiencesNew() {
  const actionData = useActionData<typeof action>();
  const context = useOutletContext<{ contactDb: any }>();
  const [pendingFileName, setPendingFileName] = useState("");
  const [pendingContacts, setPendingContacts] = useState<Contact[]>([]);
  const [pendingContactHeaders, setPendingContactHeaders] = useState<string[]>([]);
  const [currentContacts, setCurrentContacts] = useState<Contact[]>([]);
  const [headerMapping, setHeaderMapping] = useState<Record<string, string>>({});
  const [splitNameColumn, setSplitNameColumn] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<Contact[]>([]);

  const displayFileToUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const filePath = e.target.value;
    const file = e.target.files?.[0];
    const data = await file?.text();
    if (!data) return;
    const { contacts, headers } = parseCSV(data);

    const cleanPreviewData = contacts.slice(0, 5).map(contact => {
      const cleanContact: Record<string, any> = {};
      headers.forEach(header => {
        const value = (contact as any)[header];
        cleanContact[header] = value === 'null' || value === undefined ? '' : value;
      });
      return cleanContact;
    });

    const nameColumnHeader = headers.find(h =>
      h.toLowerCase() === 'name' || h.toLowerCase() === 'full name'
    );

    const initialMapping = headers.reduce((acc, header) => {
      const normalizedHeader = header.toLowerCase().trim();
      if (nameColumnHeader && header === nameColumnHeader) {
        setSplitNameColumn(header);
        acc[header] = "name";
      } else if (VALID_HEADERS.includes(normalizedHeader)) {
        acc[header] = normalizedHeader;
      } else {
        acc[header] = "other_data";
      }
      return acc;
    }, {} as Record<string, string>);

    console.log('Raw contacts:', contacts.slice(0, 5));
    console.log('Clean preview data:', cleanPreviewData);

    setHeaderMapping(initialMapping);
    setPendingFileName(filePath.split("\\").at(-1) || "");
    setPendingContactHeaders(headers);
    setPreviewData(cleanPreviewData as unknown as Contact[]);
  };

  const updateHeaderMapping = (originalHeader: string, newMapping: string) => {
    setHeaderMapping(prev => ({
      ...prev,
      [originalHeader]: newMapping
    }));
  };

  const handleRemoveFile = () => {
    setPendingFileName("");
    const fileInput = document.getElementById("contacts") as HTMLInputElement;
    if (fileInput) {
      fileInput.value = "";
    }
  };

  const getCurrentContacts = async () => {
    setCurrentContacts(context.contactDb.getAllContacts());
  }

  return (
    <section
      id="form"
      className="mx-auto mt-8 flex h-fit w-fit flex-col items-center justify-center"
    >
      <Card bgColor="bg-brand-secondary dark:bg-zinc-900">
        <CardTitle>Add an Audience</CardTitle>
        {actionData?.error != null && (
          <p className="text-center font-Zilla-Slab text-2xl font-bold text-red-500">
            Error: {actionData.error.message}
          </p>
        )}
        <CardContent>
          <Form
            method="POST"
            className="space-y-6"
            encType="multipart/form-data"
          >
            <input type="hidden" name="formAction" value="newAudience" />
            <label
              htmlFor="audience-name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-200"
            >
              Audience Name
              <input
                type="text"
                name="audience-name"
                id="audience-name"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-brand-primary dark:border-gray-600 dark:bg-zinc-800 dark:text-white"
              />
            </label>
            <div className="block text-sm font-medium text-gray-700 dark:text-gray-200">
              <div>
                <div className="flex items-baseline gap-4">
                  <div>Upload contacts (Optional .csv file):</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      name="contacts"
                      id="contacts"
                      accept=".csv"
                      className="hidden"
                      onChange={displayFileToUpload}
                    />
                    <Button asChild variant="outline" size="icon">
                      <label htmlFor="contacts" className="cursor-pointer">
                        <MdAdd />
                      </label>
                    </Button>
                  </div>
                </div>
                {pendingFileName && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{pendingFileName}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={handleRemoveFile}
                    >
                      <MdClose />
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-sm font-normal italic">
                If no file is uploaded, you can add contacts later.
              </p>
              <p className="text-sm font-normal italic">Preferred format</p>
            </div>
            <div className="flex items-center gap-4">
              <Button
                className="h-fit min-h-[48px] w-full rounded-md bg-brand-primary px-8 py-2 font-Zilla-Slab text-lg font-bold tracking-[1px]
                  text-white transition-colors duration-150 ease-in-out hover:bg-brand-secondary hover:bg-white hover:text-black"
                type="submit"
              >
                Add Audience
              </Button>{" "}
            </div>
          </Form>
        </CardContent>
      </Card>
      {pendingContactHeaders.length > 0 && (
        <div className="mt-4 space-y-4">
          <div className="rounded-lg border p-4">
            <h3 className="mb-4 font-medium">Map CSV Headers</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CSV Header</TableHead>
                  <TableHead>Maps To</TableHead>
                  {splitNameColumn && <TableHead>Options</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingContactHeaders.map(header => (
                  <TableRow key={header}>
                    <TableCell>{header}</TableCell>
                    <TableCell>
                      <select
                        className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-zinc-800"
                        value={headerMapping[header] || 'other_data'}
                        onChange={(e) => updateHeaderMapping(header, e.target.value)}
                      >
                        {VALID_HEADERS.map(validHeader => (
                          <option key={validHeader} value={validHeader}>
                            {validHeader}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    {splitNameColumn && header === splitNameColumn && (
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="split-name"
                            className="rounded border-gray-300"
                            checked={Boolean(splitNameColumn)}
                            onChange={(e) => setSplitNameColumn(e.target.checked ? header : null)}
                          />
                          <label htmlFor="split-name">Split into First/Last Name</label>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="rounded-lg border p-4">
            <h3 className="mb-4 font-medium">Data Preview (First 5 rows)</h3>
            <div className="max-w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {pendingContactHeaders.map(header => (
                      <TableHead key={header} className="whitespace-nowrap">
                        {header}
                        <div className="text-xs text-gray-500">
                          → {headerMapping[header]}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.map((row, idx) => {

                    return (
                      <TableRow key={idx}>
                        {pendingContactHeaders.map(header => (
                          <TableCell key={header} className="whitespace-nowrap">
                            {(() => {
                              const value = (row as any)[header];
                              if (value === null || value === undefined || value === 'null') {
                                return '';
                              }
                              if (typeof value === 'object') {
                                return JSON.stringify(value);
                              }
                              return String(value);
                            })()}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}
      {currentContacts.length > 0 && (
        <div className="flex flex-col gap-4">
          { }
        </div>
      )}
    </section>
  );
}
