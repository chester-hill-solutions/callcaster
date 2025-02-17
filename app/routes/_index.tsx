import {
  Form,
  json,
  Link,
  NavLink,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import {
  Phone,
  Zap,
  DollarSign,
  Users,
  Check,
  MessageSquare,
  VolumeX,
  MessageCircle,
} from "lucide-react";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const {
    supabaseClient: supabase,
    headers,
  } = createSupabaseServerClient(request);
  const user = await supabase.auth.getUser();
  return json({ user });
};

const ContactForm = ({ isBusy }: { isBusy: boolean }) => (
  <div className="animate-fade-in-up animation-delay-600 mb-16 font-Zilla-Slab">
    <h2 className="mb-6 text-center text-3xl font-bold">Get In Touch</h2>
    <div className="flex flex-wrap gap-8">
      <div className="min-w-[300px] flex-1">
        <h3 className="mb-4 text-2xl font-semibold">
          We Support All Kinds of Businesses
        </h3>
        <p className="mb-4 text-lg">
          At CallCaster, we understand that every business has unique
          communication needs. Whether you're a:
        </p>
        <ul className="mb-4 list-inside list-disc space-y-2">
          <li>Small startup looking to grow</li>
          <li>Medium-sized company aiming to streamline operations</li>
          <li>Large enterprise seeking advanced communication solutions</li>
          <li>Non-profit organization reaching out to supporters</li>
          <li>Political campaign connecting with voters</li>
        </ul>
        <p className="text-lg">
          We have the tools and expertise to support your goals. Get in touch
          with us today to see if we're the right fit for your business. Let's
          explore how CallCaster can elevate your communication strategy!
        </p>
      </div>
      <Card className="min-w-[300px] flex-1 bg-secondary py-8 dark:bg-zinc-800">
        <CardContent>
          <Form
            className="space-y-4"
            action="/api/contact-form"
            method="POST"
            navigate={false}
          >
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-gray-700 dark:text-gray-200"
              >
                Name
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-brand-primary dark:border-gray-600 dark:bg-zinc-700 dark:text-white"
              />
            </div>
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 dark:text-gray-200"
              >
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-brand-primary dark:border-gray-600 dark:bg-zinc-700 dark:text-white"
              />
            </div>
            <div>
              <label
                htmlFor="message"
                className="block text-sm font-medium text-gray-700 dark:text-gray-200"
              >
                Message
              </label>
              <textarea
                id="message"
                name="message"
                rows={4}
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-brand-primary dark:border-gray-600 dark:bg-zinc-700 dark:text-white"
              ></textarea>
            </div>
            <Button
              disabled={isBusy}
              type="submit"
              className="w-full bg-brand-primary text-white transition-all duration-300 hover:bg-brand-secondary"
            >
              Send Message
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  </div>
);

const FeatureCard = ({
  icon: Icon,
  title,
  description,
  bgColor = "bg-white dark:bg-zinc-800",
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  bgColor?: string;
}) => (
  <Card
    className={`p-6 text-center transition-all duration-300 hover:shadow-lg ${bgColor}`}
  >
    <Icon className="mx-auto mb-4 h-12 w-12 text-brand-primary" />
    <h3 className="mb-2 text-xl font-bold">{title}</h3>
    <p>{description}</p>
  </Card>
);

const HeroSection = () => (
  <div className="mb-16 text-center font-Zilla-Slab">
    <h1 className="animate-fade-in-up font-Tabac-Slab text-6xl font-bold text-brand-primary">
      CallCaster
    </h1>
    <p className="animate-fade-in-up animation-delay-300 text-3xl font-semibold text-slate-800 dark:text-slate-200">
      Real Time Connections. Real Conversations. Real Results.
    </p>
  </div>
);
const WhyPhoneCalls = () => (
  <div className="animate-fade-in-up animation-delay-600 mb-16 font-Zilla-Slab">
    <h2 className="mb-6 text-center text-3xl font-bold">
      Why CallCaster Phone Calls?
    </h2>
    <div className="flex flex-wrap-reverse">
      <div className="min-w-[300px] flex-1">
        <div className="hidden sm:flex">
          <PersonImage />
        </div>
        <div className="flex flex-1 justify-center">
          <Button
            asChild
            className="mt-4 flex-1 text-2xl sm:flex-initial"
            size={"lg"}
          >
            <NavLink to={"./signup"}>Sign Up</NavLink>
          </Button>
        </div>
      </div>
      <div className="grid min-w-[300px] flex-1 grid-cols-1 gap-6 md:grid-cols-2">
        <FeatureCard
          icon={Phone}
          title="Direct Connection"
          description="Reach people directly and have persuasive conversations."
        />
        <FeatureCard
          icon={Zap}
          title="Raise Profile"
          description="Effectively promote your profile inexpensively."
        />
        <FeatureCard
          icon={DollarSign}
          title="Cost-Effective Outreach"
          description="Maximize outreach while keeping costs low."
        />
        <FeatureCard
          icon={Users}
          title="Maximize Engagement"
          description="Motivate call recipients to engage and drive higher interaction rates."
        />
      </div>
    </div>
  </div>
);
const PersonImage = () => (
  <div className="flex flex-auto items-center">
    <img
      src="https://nolrdvpusfcsjihzhnlp.supabase.co/storage/v1/object/public/images/person-calling.png"
      alt="Person dialing using CallCaster"
    />
  </div>
);
const ServiceShowcase = () => (
  <div className="animate-fade-in-up animation-delay-900 mb-16 font-Zilla-Slab">
    <h2 className="mb-6 text-center text-3xl font-bold">Our Services</h2>
    <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
      <Card className="p-8 bg-brand-secondary dark:bg-blue-900">
        <h3 className="mb-4 text-2xl font-bold">
          Predictive Dialer <br />& PowerDialer
        </h3>
        <p className="mb-6">
          Make more calls, faster and easier. Callers spend more time talking,
          less time dialing.
        </p>
        <ul className="mb-6 list-none space-y-2">
          {[
            "Automatic voicemail detection",
            "Skip next call",
            "Household Groups",
            "Local Caller ID",
            "Custom Phone Numbers",
            "Voicemail to Email",
          ].map((feature, index) => (
            <li key={index} className="flex items-center">
              <Check className="mr-2 h-5 w-5" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
        <p className="text-xl font-bold">Affordable per Dial pricing</p>
      </Card>

      <Card className="p-8 bg-brand-secondary dark:bg-blue-900">
        <h3 className="mb-4 text-2xl font-bold">
          Interactive Voice Recordings & Voicedrops
        </h3>
        <p className="mb-6">
          Engage at scale with interactive voice responses and targeted voice
          messages.
        </p>
        <ul className="mb-6 list-none space-y-2">
          {[
            "Customizable IVR menus",
            "Scheduled voicedrops",
            "Dynamic message branching",
            "Response data collection",
            "Integration with CRM systems",
          ].map((feature, index) => (
            <li key={index} className="flex items-center">
              <Check className="mr-2 h-5 w-5" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
        <p className="text-xl font-bold">Pricing based on volume</p>
      </Card>

      <Card className="p-8 bg-brand-secondary dark:bg-blue-900">
        <h3 className="mb-4 text-2xl font-bold">
          Text Messaging Blasts & Two-Way Conversations
        </h3>
        <p className="mb-6">
          Reach contacts instantly with targeted SMS campaigns and two-way
          messaging.
        </p>
        <ul className="mb-6 list-none space-y-2">
          {[
            "Mass text messaging",
            "Personalized messages",
            "Opt-out management",
            "Response tracking",
            "Scheduled campaigns",
          ].map((feature, index) => (
            <li key={index} className="flex items-center">
              <Check className="mr-2 h-5 w-5" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
        <p className="text-xl font-bold">Competitive per-message pricing</p>
      </Card>
    </div>
  </div>
);

const EnhancedOutreachSection = () => (
  <div className="animate-fade-in-up animation-delay-1200 mb-16 font-Zilla-Slab">
    <h2 className="mb-6 text-center text-3xl font-bold">
      Enhance Your Outreach
    </h2>
    <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
      <FeatureCard
        icon={MessageSquare}
        title="Interactive Voice Response (IVR)"
        description="Create dynamic, branching conversations to gather voter input and provide information efficiently."
        bgColor="bg-white dark:bg-zinc-800"
      />
      <FeatureCard
        icon={VolumeX}
        title="Voicedrops"
        description="Deliver targeted voice messages to large groups of voters quickly and cost-effectively."
        bgColor="bg-white dark:bg-zinc-800"
      />
      <FeatureCard
        icon={MessageCircle}
        title="Text Messaging"
        description="Engage voters with instant, personalized text messages for rapid communication and response."
        bgColor="bg-white dark:bg-zinc-800"
      />
    </div>
  </div>
);

export default function Index() {
  const { state } = useNavigation();
  const isBusy = state !== "idle";
  return (
    <main className="to-gray-150 flex min-h-screen flex-col items-center bg-gradient-to-b from-gray-100 px-4 py-8 dark:from-gray-900 dark:to-black sm:px-6 lg:px-8">
      <div className="z-10 w-full max-w-6xl space-y-16">
        <HeroSection />
        <WhyPhoneCalls />
        <ServiceShowcase />
        <EnhancedOutreachSection />

        <div>
          <div className="animate-fade-in-up animation-delay-900 mb-16 font-Zilla-Slab">
            <ContactForm isBusy={isBusy} />
          </div>
        </div>
      </div>
    </main>
  );
}
