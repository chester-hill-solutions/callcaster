import ServiceCard from "~/components/OtherServices/ServiceCard";

export default function OtherServices() {
  return (
    <main
      className="flex h-full flex-col gap-4 rounded-sm p-8 dark:text-white 
    md:mx-auto md:mt-8 md:w-[80%] md:items-start"
    >
      <h1 className="text-center font-Tabac-Slab text-6xl font-bold md:text-left">
        Services
      </h1>
      <p className="font-Zilla-Slab text-2xl font-semibold">
        Crafted by a team of experienced campaign organizers, our services are
        tailor-made for Canadian campaigns.
      </p>
      <p className="font-Zilla-Slab text-2xl font-semibold">
        Count on
        <span className="font-bold text-brand-primary"> CallCaster </span>
        for:
      </p>
      <ul
        className="grid w-full auto-cols-auto gap-8 md:auto-rows-[auto_auto] md:grid-cols-3"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 350), 1fr))",
        }}
      >
        <ServiceCard
          className="row-span-2 grid grid-rows-subgrid gap-4 rounded-md bg-brand-secondary p-8 shadow-sm dark:text-black"
          title="Data Management"
          description="Organize, optimize, and analyze all your campaign data in one place"
        />
        <ServiceCard
          className="row-span-2 grid grid-rows-subgrid  gap-4 rounded-md bg-brand-secondary p-8 shadow-sm dark:text-black"
          title="Digital Ads"
          description="Reach your audience faster with a host of digital ad services"
        />
        <ServiceCard
          className="row-span-2 grid grid-rows-subgrid  gap-4 rounded-md bg-brand-secondary p-8 shadow-sm dark:text-black"
          title="Web Development"
          description="Launch a custom campaign website quickly and easily with our team of experienced developers"
        />
        <ServiceCard
          className="row-span-2 grid grid-rows-subgrid  gap-4 rounded-md bg-brand-secondary p-8 shadow-sm dark:text-black"
          title="Robocalls"
          description="Send simple voice broadcasts at wholesale rates"
        />
        <ServiceCard
          className="row-span-2 grid grid-rows-subgrid  gap-4 rounded-md bg-brand-secondary p-8 shadow-sm dark:text-black"
          title="Robosurveys"
          description="Set up a questionaire to gather feedback and measurable data"
        />
        <ServiceCard
          className="row-span-2 grid grid-rows-subgrid  gap-4 rounded-md bg-brand-secondary p-8 shadow-sm dark:text-black"
          title="Texting (SMS)"
          description="Broadcast your message and interact with your list on their preferred platform"
        />
      </ul>
      <p className="font-Zilla-Slab text-2xl font-semibold">
        Contact <span className="text-brand-primary font-bold">info@callcaster.ca</span> for more information 
      </p>
    </main>
  );
}
