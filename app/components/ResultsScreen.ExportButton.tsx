import { Button } from "~/components/ui/button";
import { Form } from "@remix-run/react";

export const ExportButton = () => (
    <Form method="POST">
      <Button type="submit">Export Results</Button>
    </Form>
  );
  