import React from 'react';
import ServiceCard from "@/components/other-services/ServiceCard";

const services = [
  { title: "Data Management", description: "Organize, optimize, and analyze all your campaign data in one place" },
  { title: "Digital Ads", description: "Reach your audience faster with a host of digital ad services" },
  { title: "Web Development", description: "Launch a custom campaign website quickly and easily with our team of experienced developers" },
  { title: "Robocalls", description: "Send simple voice broadcasts at wholesale rates" },
  { title: "Robosurveys", description: "Set up a questionnaire to gather feedback and measurable data" },
  { title: "Texting (SMS)", description: "Broadcast your message and interact with your list on their preferred platform" },
];

interface SectionTitleProps {
  children: React.ReactNode;
}

const SectionTitle = ({ children }: SectionTitleProps) => (
  <h1 className="text-center font-Tabac-Slab text-3xl font-bold md:text-left">
    {children}
  </h1>
);

interface SectionTextProps {
  children: React.ReactNode;
}

const SectionText = ({ children }: SectionTextProps) => (
  <p className="font-Zilla-Slab text-xl font-semibold">
    {children}
  </p>
);

export default function OtherServices() {
  return (
    <main className="flex h-full flex-col gap-4 rounded-sm p-8 dark:text-white md:mx-auto md:mt-8 md:w-[80%] md:items-start">
      <SectionTitle>Services</SectionTitle>
      <SectionText>
        Crafted by a team of experienced campaign organizers, our services are
        tailor-made for Canadian campaigns.
      </SectionText>
      <SectionText>
        Count on
        <span className="font-bold text-brand-primary"> CallCaster </span>
        for:
      </SectionText>
      <ul className="flex flex-wrap justify-center gap-4">
        {services.map((service, index) => (
          <li key={index} className="w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.667rem)]">
            <ServiceCard
              className="h-full rounded-md bg-brand-secondary p-8 shadow-sm dark:text-black"
              title={service.title}
              description={service.description}
            />
          </li>
        ))}
      </ul>

      <p className="font-Zilla-Slab text-2xl font-semibold">
        Contact <span className="text-brand-primary font-bold">info@callcaster.ca</span> for more information 
      </p>
    </main>
  );
}