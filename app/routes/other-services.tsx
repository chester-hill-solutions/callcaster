import ServiceCard from "@/components/other-services/ServiceCard";

export default function OtherServices() {
  return (
    <main
      className="flex h-full flex-col gap-4 rounded-sm p-8 dark:text-white 
    md:mx-auto md:mt-8 md:w-[80%] md:items-start"
    >
      <h1 className="text-center font-Tabac-Slab text-6xl font-bold md:text-left">
        Other Services
      </h1>
      <p className="font-Zilla-Slab text-2xl font-semibold">
        Chester Hill Solutions is more than{" "}
        <span className="font-bold text-brand-primary">CallCaster</span>!
        <br /> Crafted by a team of experienced campaign managers and
        organizers, our services are tailor-made for Canadian campaigns!
      </p>
      <p className="font-Zilla-Slab text-2xl font-semibold">
        In addition to{" "}
        <span className="font-bold text-brand-primary">CallCaster</span>, we
        provide services for:
      </p>
      <ul className="grid w-full auto-cols-auto grid-cols-1 gap-8 md:grid-cols-3">
        <ServiceCard
          title="Data Management"
          description="Organize, optimize, and analyze all your campaign data in one place"
        />
        <ServiceCard
          title="Digital Ads"
          description="Reach your audience faster with a host of digital ad services"
        />
        <ServiceCard
          title="Web Development"
          description="Launch a custom campaign website quickly and easily with our team of experienced developers"
        />
      </ul>
      <p className="font-Zilla-Slab text-2xl font-semibold">
        Take your campaign to the next level with Chester Hill Solutions!
      </p>
    </main>
  );
}
