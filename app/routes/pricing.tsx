import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { BsChatLeftText } from "react-icons/bs";
import { FaPhoneVolume, FaMicrophone } from "react-icons/fa6";
import React, { ReactNode } from "react";

export async function loader({ request }: LoaderFunctionArgs) {
  return {};
}

export async function action({ request }: ActionFunctionArgs) {
  return {};
}

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

const PricingRow = ({ icon, service, type, rates }: PricingRowProps) => (
  <div className="mb-8 overflow-hidden rounded-xl bg-[#bae6fd] last:mb-0">
    <div className="flex items-center gap-3 border-b border-white/20 bg-[#bae6fd]/80 p-6">
      <span className="text-[#dc2626]">{icon}</span>
      <div>
        <h3 className="font-Zilla-Slab text-2xl font-bold uppercase text-[#dc2626]">
          {service}
        </h3>
        <p className="font-Zilla-Slab text-lg text-gray-700">{type}</p>
      </div>
    </div>
    <div className="grid gap-4 p-6 md:grid-cols-2">
      {rates.map((rate, index) => (
        <div key={index} className="rounded-lg bg-white p-6">
          <div className="mb-2">
            <div className="flex items-baseline justify-between">
              <span className="font-Zilla-Slab text-lg font-semibold text-gray-900">
                {rate.name}
              </span>
              <span className="font-Zilla-Slab text-xl font-bold text-[#dc2626]">
                {rate.price}
              </span>
            </div>
          </div>
          <p className="font-Zilla-Slab text-base text-gray-600">
            {rate.description}
          </p>
        </div>
      ))}
    </div>
  </div>
);

export default function Pricing() {
  const pricingData: PricingRowProps[] = [
    {
      icon: <BsChatLeftText size="24px" />,
      service: "Texting",
      type: "SMS",
      rates: [
        {
          name: "Incoming Text Rate",
          price: "$0.03/text",
          description: "The 'Text Rate' is charged per text (maximum 140 characters), and per Media SMS.",
        },
        {
          name: "Outgoing Text Rate",
          price: "$0.03/text",
          description: "The 'Text Rate' is charged per text (maximum 140 characters), and per Media SMS.",
        },
      ],
    },
    {
      icon: <FaPhoneVolume size="24px" />,
      service: "Calling",
      type: "Auto Dialer",
      rates: [
        {
          name: "Per Dial Rate",
          price: "$0.06/dial",
          description: "The 'Dial Rate' is the cost per call attempt. The first minute of each call is covered by the 'Dial Rate'.",
        },
        {
          name: "Per Minute Rate",
          price: "$0.06/minute",
          description: "The 'Minute Rate' cost kicks in after the first minute of each call and is the cost accrued for each remaining minute of the call.",
        },
      ],
    },
    {
      icon: <FaPhoneVolume size="24px" />,
      service: "Staffed Live Calls",
      type: "Professional Interactions",
      rates: [
        {
          name: "Per Call Rate",
          price: "$1.20/call",
          description: "Professional staffed calls with trained representatives to handle your customer interactions.",
        },
      ],
    },
    {
      icon: <FaMicrophone size="24px" />,
      service: "VoiceMail",
      type: "IVR",
      rates: [
        {
          name: "Per Dial Rate",
          price: "$0.03/dial",
          description: "The 'Dial Rate' is the cost per call attempt. The first minute of each call is covered by the 'Dial Rate'.",
        },
        {
          name: "Per Minute Rate",
          price: "$0.03/minute",
          description: "The 'Minute Rate' cost kicks in after the first minute of each call and is the cost accrued for each remaining minute of the call.",
        },
      ],
    },
  ];

  return (
    <main className="mx-auto max-w-7xl px-4 py-12">
      <SectionTitle>Our Pricing Plan</SectionTitle>
      
      <div className="space-y-6">
        {pricingData.map((row, index) => (
          <PricingRow key={index} {...row} />
        ))}
      </div>

      <div className="mt-12 text-center">
        <div className="inline-block rounded-full border-2 border-[#bae6fd] bg-white px-8 py-4">
          <p className="font-Zilla-Slab text-xl">
            For More Information Contact{" "}
            <a
              href="mailto:info@callcaster.ca"
              className="font-bold text-[#dc2626] hover:underline"
            >
              info@callcaster.ca
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
