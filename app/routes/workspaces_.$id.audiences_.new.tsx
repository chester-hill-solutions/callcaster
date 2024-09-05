import React, { useState, useEffect } from "react";
import { Form, json, useActionData, useSubmit } from "@remix-run/react";
import { MdAdd, MdClose } from "react-icons/md";
import { Card, CardContent, CardTitle } from "~/components/CustomCard";
import { Button } from "~/components/ui/button";
import { Switch } from "~/components/ui/switch";
import { Label } from "~/components/ui/label";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTrigger,
} from "~/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Contact } from "~/lib/types";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { applyRulesToQuery } from "~/lib/database.server";
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

  switch (formAction) {
    case "newAudience": {
      if (!formData.get("audience-name")) {
        return json(
          {
            success: false,
            error: "Audience name is required",
          },
          { headers },
        );
      }
      const contactsFile = formData.get("contacts") as File;
      const isConditional = formData.get("is_conditional") === "true";
      const rules = isConditional ? JSON.parse(formData.get("rules") as string) : null;

      return handleNewAudience({
        supabaseClient,
        formData,
        workspaceId,
        headers,
        contactsFile,
        campaignId: null,
        isConditional,
        rules,
        userId: serverSession.user.id
      });
    }
    case "fetchLikelyContacts": {
      const rules = JSON.parse(formData.get("rules") as string);

      try {
        let query = supabaseClient
          .from("contact")
          .select("*", { count: "exact" });

        rules.forEach((rule, index) => {
          console.log(
            `Applying rule ${index + 1}:`,
            JSON.stringify(rule, null, 2),
          );
          query = applyRulesToQuery(query, rule);
        });

        const { data, count, error } = await query;
        if (error) {
          console.error("Supabase query error:", error);
          return json({ error: error.message }, { headers, status: 500 });
        }

        if (count === null && data) {
          return json({ likelyContacts: data.length }, { headers });
        } else if (count === null) {
          return json(
            { error: "Unable to determine contact count" },
            { headers, status: 500 },
          );
        }

        return json({ likelyContacts: count, contacts: data }, { headers });
      } catch (error) {
        console.error("Error in fetchLikelyContacts:", error);
        return json(
          { error: "An unexpected error occurred" },
          { headers, status: 500 },
        );
      }
    }
    default:
      return json({ error: "Form Action not recognized" }, { headers });
  }
}

export default function AudiencesNew() {
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const [pendingFileName, setPendingFileName] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isConditional, setIsConditional] = useState(false);
  const [rules, setRules] = useState<
    {
      conditions: { field: string; operator: string; value: string }[];
      logic: "AND" | "OR";
    }[]
  >([]);
  const [currentCondition, setCurrentCondition] = useState<{
    field: string;
    operator: string;
    value: string;
  }>({
    field: "",
    operator: "",
    value: "",
  });
  const [currentLogic, setCurrentLogic] = useState<"AND" | "OR">("AND");
  const [includedContacts, setIncludedContacts] = useState<number>(0);
  const [previewContacts, setPreviewContacts] = useState<Contact[]>([]);

  useEffect(() => {
    if (actionData?.likelyContacts !== undefined) {
      setPreviewContacts(actionData.contacts || []);
      setIncludedContacts(actionData.likelyContacts);
    }
  }, [actionData]);

  const displayFileToUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filePath = e.target.value;
    setPendingFileName(filePath.split("\\").at(-1) || "");
  };

  const handleRemoveFile = () => {
    setPendingFileName("");
    const fileInput = document.getElementById("contacts") as HTMLInputElement;
    if (fileInput) {
      fileInput.value = "";
    }
  };

  const addCondition = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      currentCondition.field &&
      currentCondition.operator &&
      currentCondition.value
    ) {
      const newRule = {
        conditions: [currentCondition],
        logic: currentLogic,
      };
      const updatedRules = [...rules, newRule];
      setRules(updatedRules);
      setCurrentCondition({ field: "", operator: "", value: "" });

      const formData = new FormData();
      formData.append("formAction", "fetchLikelyContacts");
      formData.append("rules", JSON.stringify(updatedRules));
      submit(formData, { method: "post" });
    }
  };

  const updateCurrentCondition = (field: string, value: string) => {
    setCurrentCondition({ ...currentCondition, [field]: value });
  };

  const removeRule = (index: number) => {
    const newRules = [...rules];
    newRules.splice(index, 1);
    setRules(newRules);

    const formData = new FormData();
    formData.append("formAction", "fetchLikelyContacts");
    formData.append("rules", JSON.stringify(newRules));
    submit(formData, { method: "post" });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.append("rules", JSON.stringify(rules));
    formData.append("is_conditional", isConditional.toString());
    submit(formData, { method: "post" });
  };


  const handlePreviewContacts = () => {
    if (isConditional) {
      const formData = new FormData();
      formData.append("formAction", "fetchLikelyContacts");
      formData.append("rules", JSON.stringify(rules));
      submit(formData, { method: "post" });
    }
    setIsDialogOpen(true);
  };

  return (
    <section
      id="form"
      className="mx-auto mt-8 flex h-fit w-fit flex-col items-center justify-center"
    >
      <Card bgColor="bg-brand-secondary dark:bg-zinc-900">
        <CardTitle>Add an Audience</CardTitle>
        {actionData?.error && (
          <p className="text-center font-Zilla-Slab text-2xl font-bold text-red-500">
            Error: {actionData.error}
          </p>
        )}
        <CardContent>
          <Form
            method="POST"
            className="space-y-6"
            encType="multipart/form-data"
            onSubmit={handleSubmit}
          >
            <input type="hidden" name="formAction" value="newAudience" />
            <label
              htmlFor="audience-name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-200"
            >
              Audience Name
              <Input
                type="text"
                name="audience-name"
                id="audience-name"
                className="mt-1"
                required
              />
            </label>

            <div className="flex items-center space-x-2">
              <Switch
                id="is-conditional"
                name="is-conditional"
                checked={isConditional}
                onCheckedChange={setIsConditional}
              />
              <Label htmlFor="is-conditional">Conditional Audience</Label>
            </div>

            {isConditional ? (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Audience Rules</h3>
                {rules.map((rule, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span>
                      {rule.conditions[0].field} {rule.conditions[0].operator}{" "}
                      {rule.conditions[0].value} ({rule.logic})
                    </span>
                    <Button
                      type="button"
                      onClick={() => removeRule(index)}
                      variant="destructive"
                      size="icon"
                    >
                      <MdClose />
                    </Button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <Select
                    value={currentCondition.field}
                    onValueChange={(value) =>
                      updateCurrentCondition("field", value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select field" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="firstname">First Name</SelectItem>
                      <SelectItem value="surname">Last Name</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="phone">Phone</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={currentCondition.operator}
                    onValueChange={(value) =>
                      updateCurrentCondition("operator", value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select operator" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equals">Equals</SelectItem>
                      <SelectItem value="contains">Contains</SelectItem>
                      <SelectItem value="startsWith">Starts with</SelectItem>
                      <SelectItem value="endsWith">Ends with</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="text"
                    value={currentCondition.value}
                    onChange={(e) =>
                      updateCurrentCondition("value", e.target.value)
                    }
                    placeholder="Enter value"
                  />
                  <Select
                    value={currentLogic}
                    onValueChange={(value: "AND" | "OR") =>
                      setCurrentLogic(value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select logic" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AND">AND</SelectItem>
                      <SelectItem value="OR">OR</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    onClick={addCondition}
                    variant="outline"
                  >
                    Add Condition
                  </Button>
                </div>
              </div>
            ) : (
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
                <p className="text-sm font-normal italic">
                  Preferred format: CSV
                </p>
              </div>
            )}

            <div className="flex items-center gap-4">
              <Button
                className="h-fit min-h-[48px] w-full rounded-md bg-brand-primary px-8 py-2 font-Zilla-Slab text-lg font-bold tracking-[1px]
                text-white transition-colors duration-150 ease-in-out hover:bg-brand-secondary hover:bg-white hover:text-black"
                type="submit"
              >
                Add Audience
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handlePreviewContacts}
              >
                Preview Contacts ({includedContacts})
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>
            
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl bg-slate-50">
          <DialogHeader>
            <h3 className="font-Zilla-Slab text-xl font-semibold">
              Preview Contacts ({includedContacts})
            </h3>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>First Name</TableHead>
                  <TableHead>Last Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Province</TableHead>
                  <TableHead>Postal</TableHead>
                  <TableHead>Other Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewContacts.map((contact) => (
                  <TableRow key={contact?.id}>
                    <TableCell>{contact?.id}</TableCell>
                    <TableCell>{contact?.firstname}</TableCell>
                    <TableCell>{contact?.surname}</TableCell>
                    <TableCell>{contact?.phone}</TableCell>
                    <TableCell>{contact?.email}</TableCell>
                    <TableCell>{contact?.address}</TableCell>
                    <TableCell>{contact?.city}</TableCell>
                    <TableCell>{contact?.province}</TableCell>
                    <TableCell>{contact?.postal}</TableCell>
                    <TableCell>
                      {contact?.other_data.map((data, index) => (
                        <span key={index} className="block">
                          {JSON.stringify(data)}
                        </span>
                      ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}