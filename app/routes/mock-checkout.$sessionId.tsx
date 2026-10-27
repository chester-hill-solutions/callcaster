export { loader } from "./mock-checkout.$sessionId.loader.server";
export { action } from "./mock-checkout.$sessionId.action.server";

import { Form, useLoaderData } from "react-router";

export default function MockCheckout() {
  const data = useLoaderData<{ creditAmount: number }>();
  return (
    <main className="mx-auto max-w-md p-8">
      <h1>Local test checkout</h1>
      <p>Purchase {data.creditAmount} workspace credits.</p>
      <Form method="post">
        <button type="submit">Complete local test payment</button>
      </Form>
    </main>
  );
}
