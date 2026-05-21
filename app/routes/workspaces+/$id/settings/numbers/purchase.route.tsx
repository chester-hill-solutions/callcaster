import { NumberPurchase } from "@/components/phone-numbers/NumberPurchase";
import type { NumbersSearchFetcherData } from "@/components/phone-numbers/NumberPurchase";
import { Section, SectionHeader } from "@/components/shared/Section";
import { Button } from "@/components/ui/button";
import { getUserRole } from "@/lib/database.server";
import { MemberRole } from "@/lib/member-role";
import { verifyAuth } from "@/lib/supabase.server";
import type { User } from "@/lib/types";
import type { LoaderFunctionArgs } from "react-router";
import { data, Link, redirect, useFetcher, useLoaderData } from "react-router";

export type LoaderData = {
  workspaceId: string;
  creditsBalance: number;
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { supabaseClient, headers, user } = await verifyAuth(request);
  const workspaceId = params.id;
  if (!user || !workspaceId) {
    return redirect("/signin");
  }

  const userRole = await getUserRole({
    supabaseClient,
    user: user as unknown as User,
    workspaceId,
  });
  if (userRole?.role === MemberRole.Caller) {
    return redirect("..");
  }

  const { data: workspace, error } = await supabaseClient
    .from("workspace")
    .select("credits")
    .eq("id", workspaceId)
    .single();

  if (error) {
    throw new Response(error.message, { status: 500, headers });
  }

  return data(
    {
      workspaceId,
      creditsBalance: workspace?.credits ?? 0,
    },
    { headers },
  );
};

export default function PurchaseNumberPage() {
  const { workspaceId, creditsBalance } = useLoaderData<LoaderData>();
  const fetcher = useFetcher<NumbersSearchFetcherData>();

  return (
    <Section>
      <SectionHeader title="Purchase a phone number" />
      <NumberPurchase
        fetcher={fetcher}
        workspaceId={workspaceId}
        creditsBalance={creditsBalance}
        billingLink="../../billing"
      />
      <Button variant="outline" className="mt-4" asChild>
        <Link to="..">Back to numbers</Link>
      </Button>
    </Section>
  );
}
