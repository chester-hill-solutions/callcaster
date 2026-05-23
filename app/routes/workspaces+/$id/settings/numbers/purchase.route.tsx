export { loader } from "./purchase.loader.server";

import { data as routeData, Link, redirect, useFetcher, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { NumberPurchase } from "@/components/phone-numbers/NumberPurchase";
import type { NumbersSearchFetcherData } from "@/components/phone-numbers/NumberPurchase";
import { Section, SectionHeader } from "@/components/shared/Section";
import { Button } from "@/components/ui/button";

import { MemberRole } from "@/lib/member-role";

import type { User } from "@/lib/types";

;

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
