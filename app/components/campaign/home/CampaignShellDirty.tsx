import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type CampaignShellDirtyContextValue = {
  isDirty: boolean;
  setIsDirty: (dirty: boolean) => void;
  /**
   * Returns true if navigation should proceed immediately.
   * When dirty and leaving /settings pathname, opens confirm and returns false.
   */
  requestNavigate: (href: string) => boolean;
};

const CampaignShellDirtyContext =
  createContext<CampaignShellDirtyContextValue | null>(null);

function settingsPathname(href: string): boolean {
  try {
    const path = href.includes("://")
      ? new URL(href).pathname
      : href.split("#")[0]?.split("?")[0] ?? href;
    return /\/settings\/?$/.test(path);
  } catch {
    return href.includes("/settings");
  }
}

function currentIsSettings(): boolean {
  if (typeof window === "undefined") return false;
  return /\/settings\/?$/.test(window.location.pathname);
}

export function CampaignShellDirtyProvider({
  children,
}: {
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const [isDirty, setIsDirty] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const requestNavigate = useCallback(
    (href: string) => {
      const stayingOnSettings =
        currentIsSettings() && settingsPathname(href);
      if (!isDirty || stayingOnSettings) {
        return true;
      }
      setPendingHref(href);
      return false;
    },
    [isDirty],
  );

  const value = useMemo(
    () => ({ isDirty, setIsDirty, requestNavigate }),
    [isDirty, requestNavigate],
  );

  return (
    <CampaignShellDirtyContext.Provider value={value}>
      {children}
      <Dialog
        open={pendingHref != null}
        onOpenChange={(open) => {
          if (!open) setPendingHref(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
            <DialogDescription>
              You have unsaved Setup changes. Leave without saving, or stay to
              save them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setPendingHref(null)}>
              Stay
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                const href = pendingHref;
                setPendingHref(null);
                setIsDirty(false);
                if (href) {
                  navigate(href);
                }
              }}
            >
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CampaignShellDirtyContext.Provider>
  );
}

export function useCampaignShellDirty(): CampaignShellDirtyContextValue {
  const ctx = useContext(CampaignShellDirtyContext);
  if (!ctx) {
    return {
      isDirty: false,
      setIsDirty: () => {},
      requestNavigate: () => true,
    };
  }
  return ctx;
}
