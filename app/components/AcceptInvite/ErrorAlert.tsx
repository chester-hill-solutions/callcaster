import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";

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
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>{error.message}</AlertDescription>
    </Alert>
  );
}