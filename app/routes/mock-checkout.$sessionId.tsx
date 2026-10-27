import { Form, redirect, useLoaderData } from "react-router";
import { verifyAuth } from "@/lib/auth.server";
import {
  completeLocalMockCheckout,
  getLocalMockCheckout,
} from "@/lib/platform-billing.server";

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { sessionId?: string };
}) {
  await verifyAuth(request);
  const session = getLocalMockCheckout(params.sessionId ?? "");
  if (!session) throw new Response("Not found", { status: 404 });
  return { creditAmount: session.creditAmount };
}

export async function action({
  request,
  params,
}: {
  request: Request;
  params: { sessionId?: string };
}) {
  const { user } = await verifyAuth(request);
  const result = await completeLocalMockCheckout({
    userId: user.id,
    sessionId: params.sessionId ?? "",
  });
  if (!result.ok) throw new Response("Not found", { status: 404 });
  return redirect(
    `/confirm-payment?session_id=${encodeURIComponent(params.sessionId ?? "")}`,
  );
}

export default function MockCheckout() {
  const data = useLoaderData<typeof loader>();
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
