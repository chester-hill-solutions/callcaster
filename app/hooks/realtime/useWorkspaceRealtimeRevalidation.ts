import { useEffect, useRef } from "react";
import { useNavigation, useRevalidator } from "react-router";
import { logger } from "@/lib/logger.client";
import { useWorkspaceEventSubscription } from "./useWorkspaceEventSubscription";

const REFRESH_DELAY_MS = 100;

export function useWorkspaceRealtimeRevalidation(workspaceId: string): void {
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const routerRef = useRef({ navigationState: navigation.state, revalidator });
  const requestRefreshRef = useRef<(() => void) | null>(null);

  /**
   * @effect Keep the event scheduler's router state current without resetting queued refreshes.
   * @effect-deps [navigation.state, revalidator] Router activity determines when a refresh can start.
   * @effect-side-effects none — updates the router state ref.
   * @effect-why-not-loader The event scheduler must observe client navigation between server events.
   */
  useEffect(() => {
    routerRef.current = { navigationState: navigation.state, revalidator };
  }, [navigation.state, revalidator]);

  /**
   * @effect Batch workspace event refreshes and retain changes received during navigation or revalidation.
   * @effect-deps [workspaceId] Each workspace owns its queued work; discard it when the workspace changes.
   * @effect-side-effects timer + fetch via router revalidation; clear pending timers and stop scheduling on cleanup.
   * @effect-why-not-loader Server events arrive outside the loader lifecycle; the scheduler requests existing loaders only when the router is idle.
   */
  useEffect(() => {
    let active = true;
    let dirty = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (!active || timer !== null || inFlight || !dirty) return;
      timer = setTimeout(() => {
        timer = null;
        if (!active) return;
        const router = routerRef.current;
        if (
          router.navigationState !== "idle" ||
          router.revalidator.state !== "idle"
        ) {
          schedule();
          return;
        }

        dirty = false;
        inFlight = true;
        const finish = () => {
          inFlight = false;
          schedule();
        };
        void router.revalidator.revalidate().then(finish, (error: unknown) => {
          logger.error("Workspace realtime refresh failed", error);
          finish();
        });
      }, REFRESH_DELAY_MS);
    };

    requestRefreshRef.current = () => {
      dirty = true;
      schedule();
    };
    return () => {
      active = false;
      requestRefreshRef.current = null;
      if (timer !== null) clearTimeout(timer);
    };
  }, [workspaceId]);

  useWorkspaceEventSubscription({
    workspaceId,
    table: ["campaign", "campaign_queue", "transaction_history", "workspace_number"],
    onChange: () => requestRefreshRef.current?.(),
  });
}
