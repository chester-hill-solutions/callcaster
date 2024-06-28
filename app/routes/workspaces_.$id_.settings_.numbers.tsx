import TeamMember, { MemberRole } from "~/components/Workspace/TeamMember";

import { ActionFunctionArgs, redirect } from "@remix-run/node";
import {
  Form,
  json,
  Link,
  useActionData,
  useFetcher,
  useLoaderData,
  useOutletContext,
} from "@remix-run/react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import {
  getUserRole,
  getWorkspacePhoneNumbers,
  getWorkspaceUsers,
  removeWorkspacePhoneNumber,
} from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { useSupabaseRealtime } from "~/hooks/useSupabaseRealtime";
import { toast, Toaster } from "sonner";
import { MdCached, MdCheckCircle, MdClose, MdError } from "react-icons/md";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const workspaceId = params.id;
  const { data: users, error } = await getWorkspaceUsers({
    supabaseClient,
    workspaceId,
  });
  const { data: phoneNumbers, error: numbersError } =
    await getWorkspacePhoneNumbers({ supabaseClient, workspaceId });

  if (serverSession) {
    const userRole = getUserRole({ serverSession, workspaceId });
    const hasAccess = userRole !== MemberRole.Caller;
    if (!hasAccess) return redirect("..");
    return json(
      {
        phoneNumbers,
        workspaceId,
      },
      { headers },
    );
  }

  return json(
    {
      phoneNumbers,
      workspaceId,
    },
    { headers },
  );
};
type ValidationRequest = {
  accountSid: string;
  callSid: string;
  friendlyName: string;
  phoneNumber: string;
  validationCode: string;
};
type NumberCapabilities = {
  fax: boolean;
  mms: boolean;
  sms: boolean;
  voice: boolean;
  verification_status: boolean;
};
type NumberRequest = Array<{
  id: bigint;
  created_at: string;
  workspace: string;
  friendly_name: string;
  phone_number: string;
  capabilities: NumberCapabilities;
}>;
type CallerIDResponse = {
  validationRequest: ValidationRequest;
  numberRequest: NumberRequest;
};

export const action = async ({ request, params }) => {
  const { supabaseClient } = await getSupabaseServerClientWithSession(request);

  const data = Object.fromEntries(await request.formData());
  const formName = data.formName;
  const workspace_id = params.id;

  if (formName === "caller-id") {
    delete data.formName;
    const res = await fetch(`${process.env.BASE_URL}/api/caller-id`, {
      body: JSON.stringify({ ...data, workspace_id }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const { validationRequest, numberRequest }: CallerIDResponse =
      await res.json();
    return { validationRequest, numberRequest };
  } else if (formName === "remove-number") {
    delete data.formName;
    const { error } = await removeWorkspacePhoneNumber({
      supabaseClient,
      numberId: data.numberId,
      workspaceId: workspace_id,
    });
    if (error) return { error };
    return null;
  }
  return { error: "What?" };
};

export default function WorkspaceSettings() {
  const { phoneNumbers: initNumbers, workspaceId } =
    useLoaderData<typeof loader>();
  const { supabase } = useOutletContext();
  const actionData = useActionData<typeof action>();
  const [isDialogOpen, setDialog] = useState(!!actionData?.data);
  const fetcher = useFetcher("numbers");
  const { phoneNumbers } = useSupabaseRealtime({
    supabase,
    workspace: workspaceId,
    init: { phoneNumbers: initNumbers },
  });

  useEffect(() => {
    if (actionData?.error) {
      toast.error(actionData.error);
    }
    if (actionData?.validationRequest) {
      setDialog(true);
    }
  }, [actionData]);

  return (
    <Dialog open={isDialogOpen} onOpenChange={setDialog}>
      <DialogContent className="flex w-[450px] flex-col items-center bg-card">
        <DialogHeader>
          <DialogTitle className="text-center font-Zilla-Slab text-4xl text-primary">
            Your verification code
          </DialogTitle>
          <div className="w-[400px]">
            <p className="text-center">
              You will receive a call at{" "}
              {actionData?.validationRequest?.phoneNumber}.
            </p>
            <div className="flex justify-center">
              <div className="my-4 rounded-md border-2 border-secondary bg-slate-50 p-4 text-5xl shadow-lg">
                {actionData?.validationRequest?.validationCode}
              </div>
            </div>
            <p className="text-center">Enter this code when prompted</p>
          </div>
        </DialogHeader>
      </DialogContent>
      <div className="flex flex-col">
        <div className="flex justify-end pr-4 pt-4">
          <Button
            asChild
            variant="outline"
            className="h-full w-fit border-0 border-black bg-zinc-600 font-Zilla-Slab text-2xl font-semibold text-white dark:border-white"
          >
            <Link to=".." relative="path">
              Back
            </Link>
          </Button>
        </div>

        <div className="flex flex-wrap">
          <div className="m-4 flex w-fit flex-1 flex-col justify-between gap-4 rounded-sm bg-brand-secondary px-8 pb-10 pt-6 dark:border-2 dark:border-white dark:bg-transparent dark:text-white">
            <div>
              <h3 className="text-center font-Zilla-Slab text-4xl font-bold">
                Existing Numbers
              </h3>
              <div className="flex flex-col py-4">
                <table className="w-full table-auto">
                  <thead>
                    <tr className="">
                      <th className="py-2"></th>
                      <th className="py-2 text-left">Caller ID</th>
                      <th className="py-2 text-left">Phone Number</th>
                      <th className="py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {phoneNumbers?.map((number) => (
                      <tr
                        key={number.id}
                        className="border-b dark:border-gray-700"
                      >
                        <td className="py-2">
                          <Form method="DELETE" name="remove-number">
                            <input
                              type="hidden"
                              name="formName"
                              value="remove-number"
                            />

                            <input
                              name="numberId"
                              hidden
                              value={number.id}
                              readOnly
                              id="numberId"
                            />
                            <button type="submit">
                              <MdClose />
                            </button>
                          </Form>
                        </td>
                        <td className="px-2 py-2 text-left font-semibold">
                          {number.friendly_name}
                        </td>
                        <td className="px-2 py-2">{number.phone_number}</td>
                        <td className="py-2">
                          {number.capabilities.verification_status ===
                          "success" ? (
                            <div className="flex items-center gap-2">
                              <p className="text-xs uppercase">Active</p>
                              <MdCheckCircle fill="#008800" size={24} />
                            </div>
                          ) : number.capabilities.verification_status ===
                            "failed" ? (
                            <div className="flex items-center gap-2">
                              <p className="text-xs uppercase">
                                {number.capabilities.verification_status}
                              </p>
                              <MdError fill="#880000" size={24} />
                            </div>
                          ) : number.capabilities.verification_status ===
                            "pending" ? (
                            <div className="flex items-center gap-2">
                              <p className="text-xs uppercase">
                                {number.capabilities.verification_status}
                              </p>
                              <MdCached size={24} />
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="m-4 flex w-fit flex-auto flex-col justify-between gap-4 rounded-sm bg-brand-secondary px-8 pb-10 pt-6 dark:border-2 dark:border-white dark:bg-transparent dark:text-white">
            <div>
              <h3 className="text-center font-Zilla-Slab text-4xl font-bold">
                Add your number
              </h3>
              <div>
                <div className="flex flex-col py-4">
                  <p className="self-start pb-2 font-sans text-lg font-bold uppercase tracking-tighter text-gray-600">
                    Verify your number
                  </p>
                  <div className="flex gap-4 rounded-md border-2 border-gray-600 p-2">
                    <div className="flex flex-1 flex-col gap-2">
                      <Form method="POST" name="caller-id">
                        <input
                          type="hidden"
                          name="formName"
                          value="caller-id"
                        />

                        <div className="flex flex-col items-start">
                          <label htmlFor="phoneNumber">Your Phone Number</label>
                          <input
                            id="phoneNumber"
                            name="phoneNumber"
                            className="w-full"
                            required
                          />
                          <caption>The phone number you currently own</caption>
                        </div>
                        <div className="flex flex-col items-start">
                          <label htmlFor="friendlyName">Caller ID Name</label>
                          <input
                            id="friendlyName"
                            name="friendlyName"
                            className="w-full"
                            required
                          />
                          <caption>
                            How you wish to be identified on Caller ID.
                          </caption>
                        </div>
                        <div className="py-2">
                          <Button type="submit">Verify</Button>
                        </div>
                      </Form>
                    </div>
                    <p className="max-w-[240px] py-4">
                      Upon submission of this form, you will be provided with a
                      6 digit verification code. You will receive a call on the
                      entered phone number, and will be prompted to enter the
                      code.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="m-4 flex w-fit flex-auto flex-col justify-between gap-4 rounded-sm bg-brand-secondary px-8 pb-10 pt-6 dark:border-2 dark:border-white dark:bg-transparent dark:text-white">
            <div>
              <h3 className="text-center font-Zilla-Slab text-4xl font-bold">
                Purchase a Number
              </h3>
              <div>
                <div className="flex flex-col py-4">
                  <p className="self-start pb-2 font-sans text-lg font-bold uppercase tracking-tighter text-gray-600">
                    Number Lookup
                  </p>
                  <div className="flex flex-col gap-4 rounded-md border-2 border-gray-600 p-2">
                    <div className="flex flex-1 flex-col gap-2">
                      <fetcher.Form action="/api/numbers">
                        <input
                          type="hidden"
                          name="formName"
                          value="caller-id"
                        />
                        <div className="flex flex-col items-start">
                          <label htmlFor="areaCode">Area Code</label>
                          <div className="flex">
                            <input
                              id="areaCode"
                              name="areaCode"
                              className="w-full"
                            />
                            <Button type="submit">Search</Button>
                          </div>
                          <caption>
                            3-digit Area Code of the locale you would like to
                            search
                          </caption>
                        </div>
                      </fetcher.Form>
                    </div>
                    <div className="flex flex-1 flex-col">
                      <table className="w-full table-auto border-collapse">
                        <thead>
                          <tr className="bg-gray-100 font-Zilla-Slab dark:bg-gray-800">
                            <th className="px-2 py-1 text-left text-sm">
                              Friendly Name
                            </th>
                            <th className="px-2 py-1 text-left text-sm">
                              Phone Number
                            </th>
                            <th className="px-2 py-1 text-left text-sm">
                              Region
                            </th>
                            <th className="px-2 py-1 text-left text-sm">
                              Capabilities
                            </th>
                            <th className="px-2 py-1 text-left text-sm">
                              Price
                            </th>
                            <th className="px-2 py-1 text-left text-sm">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {fetcher.data &&
                            fetcher.data.map((number) => (
                              <tr
                                key={number.phoneNumber}
                                className="border-b dark:border-gray-700"
                              >
                                <td className="px-2 py-1 text-sm">
                                  {number.friendlyName}
                                </td>
                                <td className="px-2 py-1 text-sm">
                                  {number.phoneNumber}
                                </td>
                                <td className="px-2 py-1 text-sm">
                                  {number.region}
                                </td>
                                <td className="px-2 py-1">
                                  <ul className="text-xs">
                                    {Object.entries(number.capabilities).map(
                                      ([capability, enabled]) => (
                                        <li key={capability}>
                                          {capability}: {enabled ? "Yes" : "No"}
                                        </li>
                                      ),
                                    )}
                                  </ul>
                                </td>
                                <td className="px-2 py-1 text-sm">$3.00/mo</td>
                                <td className="px-2 py-1">
                                  <Form
                                    method="POST"
                                    action="/api/numbers"
                                    navigate={false}
                                  >
                                    <input
                                      hidden
                                      readOnly
                                      name="phoneNumber"
                                      value={number.phoneNumber}
                                    />
                                    <input
                                      type="hidden"
                                      name="workspace_id"
                                      value={workspaceId}
                                    />

                                    <button
                                      className="rounded bg-blue-500 px-2 py-1 text-xs font-bold text-white hover:bg-blue-600"
                                      type="submit"
                                    >
                                      Purchase
                                    </button>
                                  </Form>
                                </td>
                              </tr>
                            ))}
                          {!fetcher.data && (
                            <>
                              <tr className="animate-pulse border-b dark:border-gray-700">
                                <td className="px-2 py-1">
                                  <div className="h-4 rounded bg-gray-300 dark:bg-gray-600"></div>
                                </td>
                                <td className="px-2 py-1">
                                  <div className="h-4 rounded bg-gray-300 dark:bg-gray-600"></div>
                                </td>
                                <td className="px-2 py-1">
                                  <div className="h-4 rounded bg-gray-300 dark:bg-gray-600"></div>
                                </td>
                                <td className="px-2 py-1">
                                  <div className="h-4 rounded bg-gray-300 dark:bg-gray-600"></div>
                                </td>
                                <td className="px-2 py-1">
                                  <div className="h-4 rounded bg-gray-300 dark:bg-gray-600"></div>
                                </td>
                                <td className="px-2 py-1">
                                  <div className="h-4 rounded bg-gray-300 dark:bg-gray-600"></div>
                                </td>
                              </tr>
                              <tr className="animate-pulse border-b dark:border-gray-700">
                                <td className="px-2 py-1">
                                  <div className="h-4 rounded bg-gray-300 dark:bg-gray-600"></div>
                                </td>
                                <td className="px-2 py-1">
                                  <div className="h-4 rounded bg-gray-300 dark:bg-gray-600"></div>
                                </td>
                                <td className="px-2 py-1">
                                  <div className="h-4 rounded bg-gray-300 dark:bg-gray-600"></div>
                                </td>
                                <td className="px-2 py-1">
                                  <div className="h-4 rounded bg-gray-300 dark:bg-gray-600"></div>
                                </td>
                                <td className="px-2 py-1">
                                  <div className="h-4 rounded bg-gray-300 dark:bg-gray-600"></div>
                                </td>
                                <td className="px-2 py-1">
                                  <div className="h-4 rounded bg-gray-300 dark:bg-gray-600"></div>
                                </td>
                              </tr>
                              <tr className="animate-pulse border-b dark:border-gray-700">
                                <td className="px-2 py-1">
                                  <div className="h-4 rounded bg-gray-300 dark:bg-gray-600"></div>
                                </td>
                                <td className="px-2 py-1">
                                  <div className="h-4 rounded bg-gray-300 dark:bg-gray-600"></div>
                                </td>
                                <td className="px-2 py-1">
                                  <div className="h-4 rounded bg-gray-300 dark:bg-gray-600"></div>
                                </td>
                                <td className="px-2 py-1">
                                  <div className="h-4 rounded bg-gray-300 dark:bg-gray-600"></div>
                                </td>
                                <td className="px-2 py-1">
                                  <div className="h-4 rounded bg-gray-300 dark:bg-gray-600"></div>
                                </td>
                                <td className="px-2 py-1">
                                  <div className="h-4 rounded bg-gray-300 dark:bg-gray-600"></div>
                                </td>
                              </tr>
                            </>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {actionData && JSON.stringify(actionData)}
        </div>
      </div>
    </Dialog>
  );
}
