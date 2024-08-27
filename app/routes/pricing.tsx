import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { BsChatLeftText } from "react-icons/bs";
import { FaChevronCircleDown, FaChevronCircleUp } from "react-icons/fa";
import { FaPhoneVolume, FaMicrophone } from "react-icons/fa6";
import React, { ReactNode } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";

export async function loader({ request }: LoaderFunctionArgs) {
  return {};
}

export async function action({ request }: ActionFunctionArgs) {
  return {};
}

const SectionTitle = ({ children }) => (
  <h1 className="text-center font-Zilla-Slab text-5xl font-bold md:text-left">
    {children}
  </h1>
);

const SectionText = ({ children }) => (
  <p className="font-Zilla-Slab text-xl font-semibold">{children}</p>
);

const PricingCard = ({ children, cardTitle, cardIcon }): ReactNode => (
  <>
    <div
      id={`pricing-${cardTitle}`}
      className="flex h-fit w-full flex-col items-center gap-4 rounded-xl bg-[hsl(198,100%,93%)] px-4 py-8 drop-shadow-[4px_8px_4px_rgba(0,0,0,0.33)]"
    >
      <h3 className="font-Sarabun flex items-baseline justify-center gap-4 text-center text-4xl font-semibold uppercase leading-none text-brand-primary">
        <span>{cardTitle}</span>
        {cardIcon}
      </h3>
      <div
        id="product-card"
        className="flex w-full flex-col items-center justify-center gap-4 rounded-lg py-4"
      >
        {children}
      </div>
    </div>
  </>
);

export default function Pricing() {
  return (
    <main className="flex flex-col gap-4 rounded-sm p-8 dark:text-white md:mx-auto md:h-[calc(100vh-80px)] md:min-h-fit md:w-[90%] md:items-start">
      <SectionTitle>Our Pricing Plan</SectionTitle>
      <section
        id="plans-container"
        className="flex h-full w-full flex-col gap-8 md:flex-row"
      >
        <PricingCard
          cardTitle={"Text Messaging"}
          cardIcon={<BsChatLeftText size="28px" />}
        >
          <p className="font-Zilla-Slab text-3xl font-semibold">SMS</p>

          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1" className="w-full">
              <AccordionTrigger className="w-full bg-brand-tertiary px-8 hover:bg-brand-primary hover:text-white hover:no-underline data-[state=closed]:rounded-lg data-[state=open]:rounded-t-lg data-[state=open]:bg-brand-primary data-[state=open]:text-white">
                <div className="flex w-full items-center justify-between">
                  <p className="font-Zilla-Slab text-xl font-semibold">
                    Incoming Text Rate:{" "}
                    <span className="ml-2 text-2xl font-bold">$0.03/text</span>
                  </p>
                </div>
              </AccordionTrigger>
              <AccordionContent className="rounded-b-lg bg-white px-8 py-4">
                <p className="w-full font-Zilla-Slab text-xl font-semibold">
                  The Text Rate is charged per text (maximum 140 characters),
                  and per Media SMS.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1" className="w-full">
              <AccordionTrigger className="w-full bg-brand-tertiary px-8 hover:bg-brand-primary hover:text-white hover:no-underline data-[state=closed]:rounded-lg data-[state=open]:rounded-t-lg data-[state=open]:bg-brand-primary data-[state=open]:text-white">
                <div className="flex w-full items-center justify-between">
                  <p className="font-Zilla-Slab text-xl font-semibold">
                    Outgoing Text Rate:{" "}
                    <span className="ml-2 text-2xl font-bold">$0.03/text</span>
                  </p>
                </div>
              </AccordionTrigger>
              <AccordionContent className="rounded-b-lg bg-white px-8 py-4">
                <p className="w-full font-Zilla-Slab text-xl font-semibold">
                  The Text Rate is charged per text (maximum 140 characters),
                  and per Media SMS.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </PricingCard>

        <PricingCard
          cardTitle={"Calling"}
          cardIcon={<FaPhoneVolume size={"28px"} />}
        >
          <p className="font-Zilla-Slab text-3xl font-semibold">Auto Dialer</p>

          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1" className="w-full">
              <AccordionTrigger className="w-full bg-brand-tertiary px-8 hover:bg-brand-primary hover:text-white hover:no-underline data-[state=closed]:rounded-lg data-[state=open]:rounded-t-lg data-[state=open]:bg-brand-primary data-[state=open]:text-white">
                <div className="flex w-full items-center justify-between">
                  <p className="font-Zilla-Slab text-xl font-semibold">
                    Per Dial Rate:{" "}
                    <span className="ml-2 text-2xl font-bold">$0.06/dial</span>
                  </p>
                </div>
              </AccordionTrigger>
              <AccordionContent className="rounded-b-lg bg-white px-8 py-4">
                <p className="w-full font-Zilla-Slab text-xl font-semibold">
                  The Dial Rate is the cost per call attempt. The first minute
                  of each call is covered by the dial rate.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1" className="w-full">
              <AccordionTrigger className="w-full bg-brand-tertiary px-8 hover:bg-brand-primary hover:text-white hover:no-underline data-[state=closed]:rounded-lg data-[state=open]:rounded-t-lg data-[state=open]:bg-brand-primary data-[state=open]:text-white">
                <div className="flex w-full items-center justify-between">
                  <p className="font-Zilla-Slab text-xl font-semibold">
                    Per Minute Rate:{" "}
                    <span className="ml-2 text-2xl font-bold">
                      $0.06/minute
                    </span>
                  </p>
                </div>
              </AccordionTrigger>
              <AccordionContent className="rounded-b-lg bg-white px-8 py-4">
                <p className="w-full font-Zilla-Slab text-xl font-semibold">
                  The Minute Rate cost kicks in after the first minute of each
                  call and is the cost accrewed for each remaining minute of the
                  call.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </PricingCard>

        <PricingCard
          cardTitle={"VoiceMail"}
          cardIcon={<FaMicrophone size="28px" />}
        >
          <p className="font-Zilla-Slab text-3xl font-semibold">IVR</p>

          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1" className="w-full">
              <AccordionTrigger className="w-full bg-brand-tertiary px-8 hover:bg-brand-primary hover:text-white hover:no-underline data-[state=closed]:rounded-lg data-[state=open]:rounded-t-lg data-[state=open]:bg-brand-primary data-[state=open]:text-white">
                <div className="flex w-full items-center justify-between">
                  <p className="font-Zilla-Slab text-xl font-semibold">
                    Per Dial Rate:{" "}
                    <span className="ml-2 text-2xl font-bold">$0.03/dial</span>
                  </p>
                </div>
              </AccordionTrigger>
              <AccordionContent className="rounded-b-lg bg-white px-8 py-4">
                <p className="w-full font-Zilla-Slab text-xl font-semibold">
                  The Dial Rate is the cost per call attempt. The first minute
                  of each call is covered by the dial rate.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1" className="w-full">
              <AccordionTrigger className="w-full bg-brand-tertiary px-8 hover:bg-brand-primary hover:text-white hover:no-underline data-[state=closed]:rounded-lg data-[state=open]:rounded-t-lg data-[state=open]:bg-brand-primary data-[state=open]:text-white">
                <div className="flex w-full items-center justify-between">
                  <p className="font-Zilla-Slab text-xl font-semibold">
                    Per Minute Rate:{" "}
                    <span className="ml-2 text-2xl font-bold">
                      $0.03/minute
                    </span>
                  </p>
                </div>
              </AccordionTrigger>
              <AccordionContent className="rounded-b-lg bg-white px-8 py-4">
                <p className="w-full font-Zilla-Slab text-xl font-semibold">
                  The Minute Rate cost kicks in after the first minute of each
                  call and is the cost accrewed for each remaining minute of the
                  call.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </PricingCard>
      </section>

      <p className="rounded-3xl border-4 border-brand-secondary bg-white p-4 font-Zilla-Slab text-2xl font-bold">
        For More Information Contact <br />
        <span className="font-bold text-brand-primary">info@callcaster.ca</span>
      </p>
      <img
        src="/Hero-1.png"
        alt=""
        className="fixed left-0 top-0 z-[-5] hidden opacity-10 md:block"
      />
    </main>
  );
}
