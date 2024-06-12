import { Form } from "@remix-run/react";
import { Button } from "./ui/button";

const AudienceForm = ({
  audienceInfo,
  handleSaveAudience,
  audience_id,
  workspace_id
}) => (
  <Form action="/api/audiences" method="PATCH" onSubmit={handleSaveAudience}>
    <input name="id" hidden value={audience_id} readOnly />
    <input name="workspace" hidden value={workspace_id} readOnly />
    <input
      type="text"
      name="name"
      placeholder="Audience Name"
      value={audienceInfo?.name}
      className="border-[unset] border-b-2 border-b-solid border-b-[#333] text-[#333]"
    />
    <Button type="submit">SAVE</Button>
  </Form>
);

export { AudienceForm };
