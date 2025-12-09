import { Button } from "@/components/ui/button";
import { Form } from "@remix-run/react";

export const ExportButton = ({isBusy}:{isBusy:boolean;}) => (
    <Form method="POST">
      <Button disabled={isBusy} type="submit">Export Results</Button>
    </Form>
  );
  