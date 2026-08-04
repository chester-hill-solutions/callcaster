import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface ErrorAlertProps {
  error: {
    message?: string;
    code?:number;
    name?:string;
  }
}

export function ErrorAlert({ error }: ErrorAlertProps) {
  if (!error || error?.message === "Email link is invalid or has expired" ) return null;
  return (
    <Alert variant="destructive">
      <AlertTitle>Something went wrong</AlertTitle>
      <AlertDescription>
        We couldn&apos;t process your invitation. The link may have expired —
        ask your workspace admin to send a new one.
      </AlertDescription>
    </Alert>
  );
}