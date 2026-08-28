// no server args used
import { BsChatLeftText } from "react-icons/bs";
import { FaHeadset, FaPhoneVolume, FaSimCard } from "react-icons/fa6";
import { MdOutlinePayments } from "react-icons/md";
import { PiPhoneCallFill } from "react-icons/pi";
import type { ReactNode } from "react";
import type { MetaFunction } from "react-router";
import {
  buildPublicPricingContent,
  type PublicPricingRow,
} from "@/lib/public-pricing";

export { loader, action } from "./pricing.loader.server";

export const meta: MetaFunction = () => [{ title: "Pricing — CallCaster" }];

const SectionTitle = ({ children }: { children: ReactNode }) => (
  <h1 className="mb-12 text-center font-Zilla-Slab text-5xl font-bold">
    {children}
  </h1>
);

const SubsectionTitle = ({ children }: { children: ReactNode }) => (
  <h2 className="mb-4 mt-16 text-center font-Zilla-Slab text-2xl font-semibold text-muted-foreground first:mt-0">
    {children}
  </h2>
);

const SERVICE_ICONS: Record<string, ReactNode> = {
  Credits: <MdOutlinePayments size="24px" />,
  Texting: <BsChatLeftText size="24px" />,
  Calling: <PiPhoneCallFill size="24px" />,
  IVRs: <FaPhoneVolume size="24px" />,
  "Phone numbers": <FaSimCard size="24px" />,
};

const PricingCard = ({ row }: { row: PublicPricingRow }) => (
  <section className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
    <header className="flex items-center gap-3 border-b border-border bg-muted/40 p-4 sm:p-6">
      <span className="text-brand-primary">
        {SERVICE_ICONS[row.service] ?? <FaPhoneVolume size="24px" />}
      </span>
      <div>
        <h3 className="font-Zilla-Slab text-2xl font-bold uppercase text-brand-primary">
          {row.service}
        </h3>
        <p className="font-Zilla-Slab text-lg text-muted-foreground">
          {row.type}
        </p>
      </div>
    </header>
    <dl className="flex flex-1 flex-col divide-y divide-border">
      {row.rates.map((rate) => (
        <div key={`${row.service}-${rate.name}`} className="bg-card p-4 sm:p-6">
          <dt className="font-Zilla-Slab text-lg font-semibold text-foreground">
            {rate.name}
          </dt>
          <dd className="mt-1 font-Zilla-Slab text-xl font-bold text-brand-primary">
            {rate.price}
          </dd>
          <dd className="mt-2 font-Zilla-Slab text-base text-muted-foreground">
            {rate.description}
          </dd>
        </div>
      ))}
    </dl>
  </section>
);

export default function Pricing() {
  const { services, account, staffedCallout } = buildPublicPricingContent();

  return (
    <main className="mx-auto max-w-7xl px-4 py-12">
      <SectionTitle>Our Pricing Plan</SectionTitle>

      <SubsectionTitle>Services</SubsectionTitle>
      <div className="grid gap-6 md:grid-cols-3">
        {services.map((row) => (
          <PricingCard key={`${row.service}-${row.type}`} row={row} />
        ))}
      </div>

      <SubsectionTitle>Account &amp; numbers</SubsectionTitle>
      <div className="grid gap-6 md:grid-cols-2">
        {account.map((row) => (
          <PricingCard key={`${row.service}-${row.type}`} row={row} />
        ))}
      </div>

      <SubsectionTitle>{staffedCallout.heading}</SubsectionTitle>
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:gap-6">
          <span className="text-brand-primary">
            <FaHeadset size="32px" />
          </span>
          <div className="flex-1">
            <p className="font-Zilla-Slab text-base text-muted-foreground">
              {staffedCallout.body}
            </p>
          </div>
          <a
            href={`mailto:${staffedCallout.contactEmail}`}
            className="inline-flex items-center justify-center rounded-full border border-brand-primary bg-brand-primary px-6 py-3 font-Zilla-Slab text-base font-semibold text-white hover:bg-brand-primary/90"
          >
            Reach out
          </a>
        </div>
      </section>

      <div className="mt-12 text-center">
        <div className="inline-block rounded-full border border-border bg-card px-8 py-4">
          <p className="font-Zilla-Slab text-xl text-foreground">
            For more information contact{" "}
            <a
              href="mailto:info@callcaster.ca"
              className="font-bold text-brand-primary hover:underline"
            >
              info@callcaster.ca
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";
