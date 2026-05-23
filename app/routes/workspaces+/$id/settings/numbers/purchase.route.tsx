// @ts-nocheck
import { data as routeData, Link, redirect, useFetcher, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { NumberPurchase } from "@/components/phone-numbers/NumberPurchase";
import type { NumbersSearchFetcherData } from "@/components/phone-numbers/NumberPurchase";
import { Section, SectionHeader } from "@/components/shared/Section";
import { Button } from "@/components/ui/button";

import { MemberRole } from "@/lib/member-role";

import type { User } from "@/lib/types";

export type LoaderData = {
  workspaceId: string;
  creditsBalance: number;
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {  const { verifyAuth } = await import("@/lib/supabase.server");
  const { getUserRole } = await import("@/lib/database.server");

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

  return routeData(
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
