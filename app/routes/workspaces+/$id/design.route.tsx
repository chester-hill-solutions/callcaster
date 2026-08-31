export { loader } from "./design.loader.server";

import type { ReactNode } from "react";
import { useLoaderData } from "react-router";
import {
  CircleCheckIcon,
  InfoIcon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Theme-scoped component gallery for the semantic tone system.
 *
 * Why this page exists: tone-colored text on translucent tone washes looked
 * fine in light theme and became unreadable in dark ("A workspace sending
 * number is required…" rendered near-black text on a dark wash). Both themes
 * now sit side by side here, and the e2e axe scan (design-preview-a11y.spec)
 * fails CI on serious/critical contrast violations against this page in
 * either theme — new tone treatments land next to their dark twin by default.
 */

function ThemeScope({ theme, children }: { theme: "light" | "dark"; children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        // Tokens live on `:root`/`.light` and `.dark`, so these class scopes
        // re-theme the subtree independently of the page's own theme.
        theme === "dark" ? "dark bg-background text-foreground" : "light bg-background text-foreground",
      )}
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {theme} theme
      </p>
      {children}
    </div>
  );
}

function Gallery() {
  return (
    <div className="grid gap-4">
      <section className="grid gap-2" aria-label="Alerts">
        <h3 className="text-sm font-semibold">Alert — every variant</h3>
        <Alert variant="default">
          <InfoIcon aria-hidden />
          <AlertTitle>Default</AlertTitle>
          <AlertDescription>Neutral information with the brand wash.</AlertDescription>
        </Alert>
        <Alert variant="info">
          <InfoIcon aria-hidden />
          <AlertTitle>Info</AlertTitle>
          <AlertDescription>Sky tone via border, wash, and icon — body text stays foreground.</AlertDescription>
        </Alert>
        <Alert variant="success">
          <CircleCheckIcon aria-hidden />
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>Green tone without tone-colored body text.</AlertDescription>
        </Alert>
        <Alert variant="warning">
          <TriangleAlertIcon aria-hidden />
          <AlertTitle>Warning</AlertTitle>
          <AlertDescription>
            A workspace sending number is required before chat messages can be sent.
          </AlertDescription>
        </Alert>
        <Alert variant="destructive">
          <OctagonXIcon aria-hidden />
          <AlertTitle>Destructive</AlertTitle>
          <AlertDescription>Red tone via border, wash, and icon — body text stays foreground.</AlertDescription>
          <AlertAction>
            <Button size="sm" variant="outline">
              Retry
            </Button>
          </AlertAction>
        </Alert>
      </section>

      <section className="grid gap-2" aria-label="Badges and status">
        <h3 className="text-sm font-semibold">Badges</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>default</Badge>
          <Badge variant="secondary">secondary</Badge>
          <Badge variant="destructive">destructive</Badge>
          <Badge variant="outline">outline</Badge>
          <Badge variant="success">success</Badge>
          <Badge variant="warning">warning</Badge>
          <StatusBadge status="running" />
          <StatusBadge status="complete" />
          <StatusBadge status="paused" />
        </div>
      </section>

      <section className="grid gap-2" aria-label="Buttons and inputs">
        <h3 className="text-sm font-semibold">Buttons &amp; inputs</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="grid max-w-md gap-2">
          <Input placeholder="Text input" aria-label="Preview input" />
          <Textarea placeholder="Textarea" aria-label="Preview textarea" />
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Checkbox id="preview-checkbox" />
              <label htmlFor="preview-checkbox">Checkbox</label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="preview-switch" />
              <label htmlFor="preview-switch">Switch</label>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-2" aria-label="Data surfaces">
        <h3 className="text-sm font-semibold">Cards, progress, loading</h3>
        <Card>
          <CardHeader>
            <CardTitle>Card on tone surfaces</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Progress value={62} aria-label="Preview progress" />
            <div className="flex items-center gap-3">
              <Spinner aria-label="Preview spinner" />
              <Skeleton className="h-4 w-40" />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-2" aria-label="Toasts">
        <h3 className="text-sm font-semibold">Toasts (fire one per tone)</h3>
        <p className="text-xs text-muted-foreground">
          Toasts render in a body-level portal, so they follow the page theme —
          toggle the page theme below, then fire a tone.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => toast.success("Contact imported")}>
            success
          </Button>
          <Button size="sm" variant="secondary" onClick={() => toast.info("Sync started")}>
            info
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => toast.warning("A workspace sending number is required before chat messages can be sent.")}
          >
            warning
          </Button>
          <Button size="sm" variant="outline" onClick={() => toast.error("Message failed to send")}>
            error
          </Button>
        </div>
      </section>
    </div>
  );
}

function PageThemeToggle() {
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          document.documentElement.classList.remove("dark");
          localStorage.setItem("callcaster-theme", "light");
        }}
      >
        Page: light
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          document.documentElement.classList.add("dark");
          localStorage.setItem("callcaster-theme", "dark");
        }}
      >
        Page: dark
      </Button>
    </div>
  );
}

export default function DesignPreviewPage() {
  useLoaderData();
  return (
    <div className="mx-auto grid max-w-5xl gap-6 p-4">
      <header className="grid gap-1">
        <h1 className="font-heading text-xl font-semibold">Design preview — tone system</h1>
        <p className="text-sm text-muted-foreground">
          Every semantic tone in both themes, side by side. Scanned by axe in CI
          (light and dark); keep it that way when adding tone treatments.
        </p>
        <PageThemeToggle />
      </header>
      <ThemeScope theme="light">
        <Gallery />
      </ThemeScope>
      <ThemeScope theme="dark">
        <Gallery />
      </ThemeScope>
    </div>
  );
}
