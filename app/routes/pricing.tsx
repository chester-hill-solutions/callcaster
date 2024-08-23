import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { BsChatLeftText } from "react-icons/bs";
import { FaChevronCircleDown, FaChevronCircleUp } from "react-icons/fa";
import { FaPhoneVolume, FaMicrophone } from "react-icons/fa6";
import React from "react";

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

function handleDetailsToggle(
  e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
) {
  const parent = e.currentTarget;
  for (const child of parent.children) {
    if (child.id.includes("details-text")) {
    }
  }
}

export default function Pricing() {
  return (
    <main className="flex flex-col gap-4 rounded-sm p-8 dark:text-white md:mx-auto md:h-[calc(100vh-80px)] md:w-[90%] md:items-start">
      <SectionTitle>Our Pricing Plan</SectionTitle>
      <section id="plans-container" className="flex h-full w-full gap-8">
        <div
          id="plan-bronze"
          className="flex h-full w-full flex-col gap-4 rounded-md bg-brand-secondary/50 p-4 shadow-md"
        >
          <h3 className="flex items-center justify-center gap-4 text-center font-sans text-4xl font-semibold uppercase text-brand-primary">
            <span>Text Messaging</span>
            <BsChatLeftText />
          </h3>
        </div>
        <div
          id="plan-silver"
          className="flex h-full w-full flex-col items-center gap-8 rounded-md bg-brand-secondary/50 px-4 py-8 shadow-md"
        >
          <h3 className="flex items-center justify-center gap-4 text-center font-sans text-4xl font-semibold uppercase text-brand-primary">
            <span>Calling</span>
            <FaPhoneVolume />
          </h3>
          <div
            id="product-card"
            className="flex w-full flex-col items-center justify-center gap-4 rounded-lg py-4"
          >
            <p className="font-Zilla-Slab text-3xl font-semibold">
              Auto Dialer
            </p>

            <button
              onClick={(e) => handleDetailsToggle(e)}
              className="group flex w-full cursor-pointer flex-col items-center justify-between gap-2 rounded-lg bg-brand-tertiary text-center font-Zilla-Slab text-xl font-semibold transition-colors duration-150 hover:bg-brand-primary"
            >
              <div className="flex w-full items-center justify-between px-6 pb-2 pt-4">
                <p className="group-hover:text-white">
                  Per Dial Rate:{" "}
                  <span className="ml-2 text-2xl font-bold">
                    $0.06/per dial
                  </span>
                </p>
                <FaChevronCircleUp className="group-hover:text-white" />
              </div>
              <div
                id="details-text"
                className="flex w-full flex-col bg-white px-6 py-4"
              >
                <p className="w-full text-xl font-semibold">
                  Insert Details Here
                </p>
              </div>
            </button>

            <div className="group flex w-full cursor-pointer flex-col items-center justify-between gap-2 rounded-lg bg-brand-tertiary px-6 py-4 text-center font-Zilla-Slab text-xl font-semibold transition-colors duration-150 hover:bg-brand-primary">
              <div className="flex w-full items-center justify-between">
                <p className="group-hover:text-white">
                  Per Minute Rate:{" "}
                  <span className="ml-2 text-2xl font-bold">
                    $0.06/per minute
                  </span>
                </p>
                <FaChevronCircleDown className="group-hover:text-white" />
              </div>
              <div className="hidden flex-col">
                <p>Insert Details Here</p>
              </div>
            </div>
          </div>
        </div>
        <div
          id="plan-gold"
          className="flex h-full w-full flex-col rounded-md bg-brand-gold/50 p-4 shadow-md"
        >
          <h3 className="flex items-center justify-center gap-4 text-center font-sans text-4xl font-semibold uppercase text-brand-primary">
            <span>Voice Mails</span>
            <FaMicrophone />
          </h3>
        </div>
      </section>

      <p className="rounded-3xl border-4 border-brand-secondary p-4 font-Zilla-Slab text-2xl font-bold">
        For More Information Contact <br />
        <span className="font-bold text-brand-primary">info@callcaster.ca</span>
      </p>
    </main>
  );
}
