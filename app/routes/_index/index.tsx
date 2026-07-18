export { loader } from "./index.loader.server";

import { Form, Link, NavLink, useNavigation } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormField, FormFieldControl } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Phone,
  Zap,
  DollarSign,
  Users,
  Check,
  Volume2,
  MessageCircle,
} from "lucide-react";

const HeroSection = () => (
  <section className="grid items-center gap-10 py-16 md:grid-cols-2 md:gap-12 md:py-20">
    <div className="animate-fade-in-up space-y-6 text-center md:text-left">
      <h1 className="font-Zilla-Slab text-5xl font-bold tracking-tight text-foreground md:text-6xl">
        Real conversations at campaign scale
      </h1>
      <p className="mx-auto max-w-xl text-lg text-muted-foreground md:mx-0">
        Power dialing, interactive voice, and text messaging so your team reaches
        more people and spends more time talking.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
        <Button asChild size="lg">
          <NavLink to="./signup">Sign Up</NavLink>
        </Button>
        <Button asChild size="lg" variant="outline">
          <NavLink to="./pricing">View Pricing</NavLink>
        </Button>
      </div>
    </div>
    <div className="animate-fade-in-up flex justify-center md:justify-end">
      <img
        src="/Hero-1.png"
        alt="People connecting through CallCaster"
        className="w-full max-w-md object-contain md:max-w-full"
      />
    </div>
  </section>
);

const CHANNELS = [
  {
    icon: Phone,
    title: "Predictive Dialer & Power Dialer",
    description:
      "Make more calls, faster. Callers spend more time talking and less time dialing.",
    features: [
      "Automatic voicemail detection",
      "Household groups",
      "Local caller ID",
      "Voicemail to email",
    ],
  },
  {
    icon: Volume2,
    title: "IVR & Voicedrops",
    description:
      "Engage at scale with interactive voice menus and targeted voice messages.",
    features: [
      "Customizable IVR menus",
      "Scheduled voicedrops",
      "Dynamic message branching",
      "Response data collection",
    ],
  },
  {
    icon: MessageCircle,
    title: "Text Messaging",
    description:
      "Reach contacts instantly with targeted SMS campaigns and two-way conversations.",
    features: [
      "Mass text messaging",
      "Personalized messages",
      "Opt-out management",
      "Scheduled campaigns",
    ],
  },
] as const;

const ChannelsSection = () => (
  <section className="py-16 md:py-20">
    <div className="mb-10 space-y-3 text-center">
      <h2 className="font-Zilla-Slab text-3xl font-bold tracking-tight md:text-4xl">
        Channels that work together
      </h2>
      <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
        Run voice and text from one workspace with pricing that scales with your
        volume.
      </p>
    </div>
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      {CHANNELS.map(({ icon: Icon, title, description, features }) => (
        <div
          key={title}
          className="flex flex-col rounded-lg border border-border bg-card p-6"
        >
          <Icon className="mb-4 h-8 w-8 text-brand-primary" aria-hidden />
          <h3 className="mb-2 font-Zilla-Slab text-xl font-bold">{title}</h3>
          <p className="mb-6 text-muted-foreground">{description}</p>
          <ul className="mt-auto space-y-2">
            {features.map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-sm">
                <Check
                  className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary"
                  aria-hidden
                />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  </section>
);

const BENEFITS = [
  {
    icon: Phone,
    title: "Direct connection",
    description: "Reach people directly and have persuasive conversations.",
  },
  {
    icon: Zap,
    title: "Raise your profile",
    description: "Promote your message efficiently across your audience.",
  },
  {
    icon: DollarSign,
    title: "Cost-effective outreach",
    description: "Maximize reach while keeping per-contact costs low.",
  },
  {
    icon: Users,
    title: "Higher engagement",
    description: "Motivate recipients to respond and take the next step.",
  },
] as const;

const BenefitsSection = () => (
  <section className="py-16 md:py-20">
    <div className="mb-10 space-y-3 text-center">
      <h2 className="font-Zilla-Slab text-3xl font-bold tracking-tight md:text-4xl">
        Why calling still works
      </h2>
      <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
        A live conversation cuts through the noise and builds trust faster than
        inbox clutter.
      </p>
    </div>
    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
      {BENEFITS.map(({ icon: Icon, title, description }) => (
        <div key={title} className="space-y-3 text-center sm:text-left">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-brand-tertiary/60 text-brand-primary sm:mx-0">
            <Icon className="h-5 w-5" aria-hidden />
          </div>
          <h3 className="font-Zilla-Slab text-lg font-bold">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      ))}
    </div>
  </section>
);

const CtaSection = () => (
  <section className="py-16 md:py-20">
    <div className="rounded-xl bg-brand-secondary/40 px-6 py-12 text-center dark:bg-brand-secondary/15">
      <h2 className="mb-3 font-Zilla-Slab text-3xl font-bold tracking-tight md:text-4xl">
        Start reaching your audience
      </h2>
      <p className="mb-8 text-lg text-muted-foreground">
        Create your account and launch your first campaign today.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild size="lg">
          <NavLink to="./signup">Sign Up</NavLink>
        </Button>
        <Button asChild size="lg" variant="outline">
          <NavLink to="./pricing">View Pricing</NavLink>
        </Button>
      </div>
    </div>
  </section>
);

const ContactForm = ({ isBusy }: { isBusy: boolean }) => (
  <section className="py-16 md:py-20">
    <div className="mb-10 space-y-3 text-center">
      <h2 className="font-Zilla-Slab text-3xl font-bold tracking-tight md:text-4xl">
        Get in touch
      </h2>
      <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
        Tell us about your outreach goals and we will help you find the right fit.
      </p>
    </div>
    <div className="grid gap-10 md:grid-cols-2">
      <div className="space-y-4">
        <h3 className="font-Zilla-Slab text-2xl font-semibold">
          Built for every kind of outreach
        </h3>
        <p className="text-muted-foreground">
          Whether you are a startup growing your base, a team streamlining
          operations, a non-profit reaching supporters, or a campaign connecting
          with voters, CallCaster has the tools to match your goals.
        </p>
        <ul className="space-y-2 text-muted-foreground">
          {[
            "Small startups looking to grow",
            "Teams streamlining outreach operations",
            "Enterprises with advanced communication needs",
            "Non-profits reaching supporters",
            "Political campaigns connecting with voters",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2">
              <Check
                className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary"
                aria-hidden
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
      <Card>
        <CardContent className="pt-6">
          <Form
            className="space-y-4"
            action="/api/contact-form"
            method="POST"
            navigate={false}
          >
            {/* Honeypot: hidden from real users, bots that fill it are dropped server-side. */}
            <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
              <label htmlFor="company_website">Company website</label>
              <input
                type="text"
                id="company_website"
                name="company_website"
                tabIndex={-1}
                autoComplete="off"
              />
            </div>
            <FormField label="Name" htmlFor="name" required>
              <FormFieldControl>
                <Input id="name" name="name" required autoComplete="name" />
              </FormFieldControl>
            </FormField>
            <FormField label="Email" htmlFor="email" required>
              <FormFieldControl>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </FormFieldControl>
            </FormField>
            <FormField label="Message" htmlFor="message" required>
              <FormFieldControl>
                <Textarea id="message" name="message" rows={4} required />
              </FormFieldControl>
            </FormField>
            <Button disabled={isBusy} type="submit" className="w-full">
              Send Message
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  </section>
);

const Footer = () => (
  <footer className="w-full border-t border-border/70 bg-background">
    <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <p className="font-Tabac-Slab text-2xl font-black text-brand-primary">
          CallCaster
        </p>
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} CallCaster. All rights reserved.
        </p>
      </div>
      <nav aria-label="Footer" className="flex items-center gap-6">
        <Link
          to="/pricing"
          className="text-base font-semibold text-foreground hover:text-brand-primary"
        >
          Pricing
        </Link>
        <Link
          to="/docs"
          className="text-base font-semibold text-foreground hover:text-brand-primary"
        >
          Docs
        </Link>
        <a
          href="mailto:info@callcaster.ca"
          className="text-base font-semibold text-foreground hover:text-brand-primary"
        >
          Support
        </a>
      </nav>
    </div>
  </footer>
);

export default function Index() {
  const { state } = useNavigation();
  const isBusy = state !== "idle";
  return (
    <>
      <main className="flex min-h-screen flex-col items-center bg-background px-4 sm:px-6 lg:px-8">
        <div className="z-10 w-full max-w-6xl">
          <HeroSection />
          <ChannelsSection />
          <BenefitsSection />
          <CtaSection />
          <ContactForm isBusy={isBusy} />
        </div>
      </main>
      <Footer />
    </>
  );
}
