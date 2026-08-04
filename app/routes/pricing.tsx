// no server args used
import { BsChatLeftText } from "react-icons/bs";
import { FaPhoneVolume, FaSimCard } from "react-icons/fa6";
import { MdOutlinePayments } from "react-icons/md";
import type { ReactNode } from "react";
import type { MetaFunction } from "react-router";
import { buildPublicPricingRows } from "@/lib/public-pricing";

export { loader, action } from "./pricing.loader.server";

export const meta: MetaFunction = () => [{ title: "Pricing — CallCaster" }];

const SectionTitle = ({ children }: { children: ReactNode }) => (
  <h1 className="mb-12 text-center font-Zilla-Slab text-5xl font-bold">
    {children}
  </h1>
);

interface PricingRowProps {
  icon: ReactNode;
  service: string;
  type: string;
  rates: Array<{
    name: string;
    price: string;
    description: string;
  }>;
}

const SERVICE_ICONS: Record<string, ReactNode> = {
  Credits: <MdOutlinePayments size="24px" />,
  Texting: <BsChatLeftText size="24px" />,
  Calling: <FaPhoneVolume size="24px" />,
  "Staffed live calls": <FaPhoneVolume size="24px" />,
  "Phone numbers": <FaSimCard size="24px" />,
};

const PricingRow = ({ icon, service, type, rates }: PricingRowProps) => (
  <section className="mb-8 overflow-hidden rounded-xl border border-border bg-card last:mb-0">
    <header className="flex items-center gap-3 border-b border-border bg-muted/40 p-4 sm:p-6">
      <span className="text-brand-primary">{icon}</span>
      <div>
        <h3 className="font-Zilla-Slab text-2xl font-bold uppercase text-brand-primary">
          {service}
        </h3>
        <p className="font-Zilla-Slab text-lg text-muted-foreground">{type}</p>
      </div>
    </header>
    <dl
      className={
        rates.length === 1
          ? "divide-y divide-border p-4 sm:p-0"
          : "divide-y divide-border p-4 sm:grid sm:grid-cols-2 sm:divide-y-0 sm:gap-px sm:bg-border sm:p-0"
      }
    >
      {rates.map((rate) => (
        <div
          key={`${service}-${rate.name}`}
          className="bg-card p-4 sm:p-6"
        >
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
  const pricingData: PricingRowProps[] = buildPublicPricingRows().map((row) => ({
    ...row,
    icon: SERVICE_ICONS[row.service] ?? <FaPhoneVolume size="24px" />,
  }));

  return (
    <main className="mx-auto max-w-7xl px-4 py-12">
      <SectionTitle>Our Pricing Plan</SectionTitle>

      <div className="space-y-6">
        {pricingData.map((row) => (
          <PricingRow key={`${row.service}-${row.type}`} {...row} />
        ))}
      </div>

      <div className="mt-12 text-center">
        <div className="inline-block rounded-full border border-border bg-card px-8 py-4">
          <p className="font-Zilla-Slab text-xl text-foreground">
            For More Information Contact{" "}
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
