import { NumbersEmptyState } from "./NumbersPurchase.EmptyState";
import { Button } from "./ui/button";
import { Fetcher, FetcherWithComponents, useFetcher } from "@remix-run/react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "./ui/dialog";
import { useEffect, useState } from "react";

import { FetcherData } from "../routes/workspaces_.$id_.settings_.numbers";

export const NumberPurchase = ({ fetcher, workspaceId }: { fetcher: FetcherWithComponents<FetcherData>, workspaceId: string }) => {
  const purchaseFetcher = useFetcher();
  const complete = purchaseFetcher.state === "idle" && Boolean(purchaseFetcher.data?.newNumber);
  const [openNumber, setOpenNumber] = useState<number | null>(null)

  useEffect(() => {
    if (complete){
      setOpenNumber(null);
    }
  },[purchaseFetcher])

  return (
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
                  <input type="hidden" name="formName" value="caller-id" />
                  <div className="flex flex-col items-start">
                    <label htmlFor="areaCode">Area Code</label>
                    <div className="flex">
                      <input id="areaCode" name="areaCode" className="w-full" />
                      <Button type="submit">Search</Button>
                    </div>
                    <caption>
                      3-digit Area Code of the locale you would like to search
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
                      <th className="px-2 py-1 text-left text-sm">Region</th>
                      <th className="px-2 py-1 text-left text-sm">
                        Capabilities
                      </th>
                      <th className="px-2 py-1 text-left text-sm">Price</th>
                      <th className="px-2 py-1 text-left text-sm">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fetcher.data &&
                      fetcher.data.map((number: any) => (
                        <Dialog key={number.phoneNumber} open={openNumber === number.phoneNumber} onOpenChange={(open) => setOpenNumber((curr) => open ? curr : null)}>
                          <tr className="border-b dark:border-gray-700">
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
                                <Button
                                  className="rounded bg-blue-500 px-2 py-1 text-xs font-bold text-white hover:bg-blue-600"
                                  type="submit"
                                  onClick={() => setOpenNumber(number.phoneNumber)}
                                  disabled={purchaseFetcher.state !== "idle"}
                                >
                                  Purchase
                                </Button>
                              <DialogContent className="flex flex-col items-center bg-card">
                                <purchaseFetcher.Form
                                  method="POST"
                                  action="/api/numbers"
                                >
                                  <DialogHeader className="py-4">
                                    <h2 className="mb-4 font-Zilla-Slab text-xl">
                                      Confirm your purchase of{" "}
                                      {number.friendlyName}
                                    </h2>
                                  </DialogHeader>
                                  <div className="py-4">
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
                                    <p>
                                      The price of this number is $3.00 per 30
                                      days rental. This rental may be cancelled
                                      at any time, billing cycles are monthly.
                                    </p>
                                  </div>
                                  <DialogFooter className="mt-4">
                                    <DialogClose asChild>
                                      <Button variant={"outline"} type="reset">
                                        Cancel
                                      </Button>
                                    </DialogClose>
                                    <Button type="submit">Purchase</Button>
                                  </DialogFooter>
                                </purchaseFetcher.Form>
                              </DialogContent>
                            </td>
                          </tr>
                        </Dialog>
                      ))}
                    {!fetcher.data && <NumbersEmptyState />}
                    {fetcher.data && Array.isArray(fetcher.data) && fetcher.data.length === 0 && <tr><td colSpan={6} className="text-center text-lg py-4">No numbers found with this Area Code.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
    </div>
  );
};
