import { Form, Link, NavLink } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardActions,
  CardContent,
  CardTitle,
} from "~/components/CustomCard";
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

const FeatureCard = ({
  icon: Icon,
  title,
  description,
  bgColor = "bg-white dark:bg-zinc-800",
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
    <h1 className="animate-fade-in-up font-Tabac-Slab text-[5rem] font-bold text-brand-primary">
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
      <div className="flex flex-col min-w-[300px] px-4">
        <div className="hidden sm:flex">
          <PersonImage />
        </div>
        <Button asChild className="text-2xl self-center" size={"lg"}>
          <NavLink to={"./signup"}>Sign Up</NavLink>
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 flex-1">
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
      <Card className="p-8" bgColor="bg-brand-secondary dark:bg-blue-900">
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
            "Local Calle rID",
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

      <Card className="p-8" bgColor="bg-brand-secondary dark:bg-blue-900">
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

      <Card className="p-8" bgColor="bg-brand-secondary dark:bg-blue-900">
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

const LoginSection = () => (
  <Card
    bgColor="bg-brand-secondary dark:bg-zinc-900"
    className="animate-fade-in-up animation-delay-1500"
  >
    <CardTitle>Start Calling</CardTitle>
    <CardContent>
      <Form
        id="homepage-signin-form"
        method="POST"
        className="space-y-6"
        action="/signin"
      >
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 dark:text-gray-200"
          >
            Email
          </label>
          <input
            type="email"
            name="email"
            id="email"
            required
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-brand-primary dark:border-gray-600 dark:bg-zinc-800 dark:text-white"
          />
        </div>
        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-700 dark:text-gray-200"
          >
            Password
          </label>
          <input
            type="password"
            name="password"
            id="password"
            required
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-brand-primary dark:border-gray-600 dark:bg-zinc-800 dark:text-white"
          />
        </div>
      </Form>
    </CardContent>
    <CardActions>
      <Button
        size="lg"
        className="w-full bg-brand-primary font-Zilla-Slab text-white transition-all duration-300 hover:bg-brand-secondary"
        type="submit"
        form="homepage-signin-form"
      >
        Login
      </Button>
      <Link
        to="/signup"
        className="w-full rounded-md bg-gray-200 px-4 py-2 text-center font-Zilla-Slab font-bold text-gray-700 transition duration-300 ease-in-out hover:bg-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
      >
        Sign Up
      </Link>
    </CardActions>
  </Card>
);
export default function Index() {
  return (
    <main className="to-gray-150 flex min-h-screen flex-col items-center bg-gradient-to-b from-gray-100 px-4 py-8 dark:from-gray-900 dark:to-black sm:px-6 lg:px-8">
      <div className="z-10 w-full max-w-6xl space-y-16">
        <HeroSection />
        <WhyPhoneCalls />
        <ServiceShowcase />
        <EnhancedOutreachSection />
        <LoginSection />
      </div>
    </main>
  );
}
