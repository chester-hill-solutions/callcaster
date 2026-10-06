import { AlertCircle, CheckCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetBody, SheetClose, SheetContent, SheetDescription,
  SheetFooter, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";

/** The trigger always occupies the same toolbar space; changing errors stay in the shared overlay. */
export function ScriptValidationDetails({ errors, inbound }: { errors: string[]; inbound: boolean }) {
  const hasErrors = errors.length > 0;
  const Icon = hasErrors ? AlertCircle : CheckCircle;
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" size="sm" variant={hasErrors ? "destructive" : "outline"}>
          <Icon aria-hidden />
          Script validation
        </Button>
      </SheetTrigger>
      <span className="sr-only" role="status">
        {hasErrors ? `Script validation has ${errors.length} issues.` : "Script validation has no issues."}
      </span>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Script validation</SheetTitle>
          <SheetDescription>
            {inbound
              ? "You can keep an invalid menu as a draft. Resolve these issues before attaching it to a phone number."
              : "Resolve these issues before launching a campaign."}
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="flex-1 overflow-y-auto">
          <Alert variant={hasErrors ? "destructive" : "success"} role={hasErrors ? "alert" : "status"}>
            <Icon aria-hidden />
            <AlertTitle>{hasErrors ? "Resolve script issues" : "No script issues"}</AlertTitle>
            <AlertDescription className="min-w-0 break-words">
              {hasErrors
                ? <ul className="min-w-0">{errors.map((error, index) => <li key={`${index}:${error}`}>{error}</li>)}</ul>
                : "The document and route targets passed validation."}
            </AlertDescription>
          </Alert>
        </SheetBody>
        <SheetFooter>
          <SheetClose>Return to editor</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
