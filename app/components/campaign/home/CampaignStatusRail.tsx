import { useEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router";
import { CheckCircle2, CircleAlert, Phone } from "lucide-react";
import type { CampaignRailItem } from "@/lib/campaign-status-rail";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCampaignShellDirty } from "@/components/campaign/home/CampaignShellDirty";
import { cn } from "@/lib/utils";

function statusHint(item: CampaignRailItem): string | null {
  if (item.id === "launch" && item.launchLifecycle) {
    switch (item.launchLifecycle) {
      case "draft":
        return "Draft";
      case "ready":
        return "Ready";
      case "running":
        return "Running";
      case "paused":
        return "Paused";
      case "scheduled":
        return "Scheduled";
      case "complete":
        return "Complete";
      case "archived":
        return "Archived";
      default: {
        const _exhaustive: never = item.launchLifecycle;
        return _exhaustive;
      }
    }
  }
  if (item.id === "results" && item.resultsStatus) {
    switch (item.resultsStatus) {
      case "idle":
        return "Idle";
      case "live":
        return "Live";
      case "has_results":
        return "Has results";
      default: {
        const _exhaustive: never = item.resultsStatus;
        return _exhaustive;
      }
    }
  }
  if (item.id === "call" && item.callStatus) {
    return item.callStatus === "blocked" ? "Blocked" : "Available";
  }
  if (item.health === "needs_attention") {
    return "Needs attention";
  }
  return null;
}

function TabStatusMark({ item }: { item: CampaignRailItem }) {
  if (item.callStatus === "blocked" || item.health === "needs_attention") {
    return (
      <CircleAlert
        className="h-3.5 w-3.5 shrink-0 text-destructive"
        aria-hidden
      />
    );
  }
  if (
    item.health === "ready" ||
    item.launchLifecycle === "ready" ||
    item.launchLifecycle === "running" ||
    item.resultsStatus === "has_results" ||
    item.callStatus === "available"
  ) {
    return (
      <CheckCircle2
        className={cn(
          "hidden h-3.5 w-3.5 shrink-0 sm:inline",
          item.isCurrent ? "text-white/90" : "text-emerald-600",
        )}
        aria-hidden
      />
    );
  }
  return null;
}

function TabItem({ item }: { item: CampaignRailItem }) {
  const { requestNavigate } = useCampaignShellDirty();
  const hint = statusHint(item);

  const tabClass = cn(
    "inline-flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors",
    item.isCurrent
      ? "bg-brand-primary text-white"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
    !item.navigable && "cursor-not-allowed opacity-50",
  );

  const label = (
    <>
      <TabStatusMark item={item} />
      <span>{item.label}</span>
      {item.id === "call" ? (
        <Phone className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
      ) : null}
      {hint && !item.isCurrent ? (
        <span className="sr-only"> — {hint}</span>
      ) : null}
    </>
  );

  if (!item.navigable) {
    const blocked = (
      <span
        className={tabClass}
        aria-disabled="true"
        title={item.tooltip ?? undefined}
      >
        {label}
      </span>
    );
    if (item.tooltip) {
      return (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>{blocked}</TooltipTrigger>
            <TooltipContent>
              <p>{item.tooltip}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return blocked;
  }

  const link = (
    <NavLink
      to={item.href}
      role="tab"
      aria-selected={item.isCurrent}
      aria-current={item.isCurrent ? "page" : undefined}
      className={tabClass}
      title={item.tooltip ?? hint ?? undefined}
      onClick={(event) => {
        if (!requestNavigate(item.href)) {
          event.preventDefault();
        }
      }}
    >
      {label}
    </NavLink>
  );

  if (item.tooltip && item.health === "needs_attention") {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent>
            <p>{item.tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return link;
}

/** Scroll `el` into horizontal center of its nearest overflow-x ancestor only. */
function scrollTabIntoTablist(
  el: HTMLElement | null,
  behavior: ScrollBehavior = "smooth",
) {
  if (!el) return;
  const tablist = el.closest('[role="tablist"]');
  if (!(tablist instanceof HTMLElement)) return;

  const elLeft = el.offsetLeft;
  const elWidth = el.offsetWidth;
  const target =
    elLeft - (tablist.clientWidth - elWidth) / 2;
  const maxScroll = Math.max(0, tablist.scrollWidth - tablist.clientWidth);
  const nextLeft = Math.min(maxScroll, Math.max(0, target));

  // jsdom (and some older engines) omit Element.scrollTo — assign scrollLeft instead.
  if (typeof tablist.scrollTo === "function") {
    tablist.scrollTo({ left: nextLeft, behavior });
  } else {
    tablist.scrollLeft = nextLeft;
  }
}

/** Horizontal L→R status tabs. Full-width equal tabs on md+; scroll strip on mobile. */
export function CampaignStatusRail({ items }: { items: CampaignRailItem[] }) {
  const location = useLocation();
  const currentSlotRef = useRef<HTMLDivElement | null>(null);

  /**
   * @effect Keep the active place tab scrolled into view in the horizontal rail.
   * @effect-deps location.pathname, location.hash, items (active slot changes with route/hash)
   * @effect-side-effects dom (tablist scrollLeft/scrollTo)
   * @effect-why-not-loader Scroll position is viewport chrome, not request data.
   */
  useEffect(() => {
    // Scope scroll to the tablist only — document scrollIntoView shifts the page.
    scrollTabIntoTablist(currentSlotRef.current);
  }, [location.pathname, location.hash, items]);

  return (
    <nav
      aria-label="Campaign sections"
      data-testid="campaign-status-rail"
      data-pathname={location.pathname}
      className="w-full"
    >
      <div
        role="tablist"
        aria-orientation="horizontal"
        className={cn(
          "flex w-full gap-1 rounded-lg border bg-card p-1",
          "overflow-x-auto overscroll-x-contain scroll-smooth snap-x snap-mandatory",
          "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {items.map((item) => (
          <div
            key={item.id}
            ref={item.isCurrent ? currentSlotRef : undefined}
            className={cn(
              "snap-center",
              // Mobile: readable width + peek of next tab; desktop: share evenly
              "w-[30%] max-w-[9rem] shrink-0 grow-0 sm:w-[24%]",
              "md:w-auto md:max-w-none md:min-w-0 md:shrink md:grow md:basis-0",
            )}
          >
            <TabItem item={item} />
          </div>
        ))}
      </div>
    </nav>
  );
}
