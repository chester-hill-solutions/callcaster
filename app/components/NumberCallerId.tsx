import { Form } from "@remix-run/react";
import { Button } from "./ui/button";

export const NumberCallerId = () => {
  return (
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
                  <input type="hidden" name="formName" value="caller-id" />

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
                Upon submission of this form, you will be provided with a 6
                digit verification code. You will receive a call on the entered
                phone number, and will be prompted to enter the code.
              </p>
            </div>
          </div>
        </div>
      </div>
  );
};