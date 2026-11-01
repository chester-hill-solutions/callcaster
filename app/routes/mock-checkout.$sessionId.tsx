export { loader } from "./mock-checkout.$sessionId.loader.server";
export { action } from "./mock-checkout.$sessionId.action.server";

import { Form, useLoaderData, useNavigation } from "react-router";
import { AuthCard } from "@/components/shared/AuthCard";
import { Button } from "@/components/ui/button";

export default function MockCheckout() {
  const data = useLoaderData<{ creditAmount: number }>();
  const navigation = useNavigation();
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <AuthCard title="Local test checkout" description={`Add ${data.creditAmount} workspace credits. This test payment does not charge a card.`}>
        <Form method="post">
          <Button type="submit" disabled={navigation.state !== "idle"}>
            Complete local test payment
          </Button>
        </Form>
      </AuthCard>
    </main>
  );
}
