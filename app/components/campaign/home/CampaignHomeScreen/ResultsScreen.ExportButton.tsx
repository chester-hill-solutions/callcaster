import { Button } from "@/components/ui/button";
import { Form } from "react-router";

export const ExportButton = ({isBusy}:{isBusy:boolean;}) => (
    <Form method="POST">
      <Button disabled={isBusy} type="submit">Export Results</Button>
    </Form>
  );
  