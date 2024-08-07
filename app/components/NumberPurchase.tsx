import { Button } from "./ui/button";
import { Form } from "@remix-run/react";

export const NumberPurchase = ({ fetcher, workspaceId }) => {
  return (
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
                  <input type="hidden" name="formName" value="caller-id" />
                  <div className="flex flex-col items-start">
                    <label className="flex gap-2" htmlFor="areaCode">Area Code <span className="text-xs">Optional</span></label>
                    <div className="flex flex-auto gap-1">
                      <input id="areaCode" name="areaCode" className="w-full" placeholder="3-digit Area Code"/>
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
                          <td className="px-2 py-1 text-sm">{number.region}</td>
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
                              action="/api/checkout"
                              navigate={false}
                            >
                              
                              <input
                                hidden
                                readOnly
                                name="lookup_key"
                                value={'price_1PlCDAJejbJxIQ3bP6CongwA'}
                              />
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
  );
};