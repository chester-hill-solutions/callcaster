import { Form } from "@remix-run/react";
import { Button } from "./ui/button";

const AudienceForm = ({
  audienceInfo,
  handleAudienceChange,
  handleSaveAudience,
  audience_id,
}) => (
  <Form action="/api/audiences" method="PATCH" onSubmit={handleSaveAudience}>
    <input name="id" hidden value={audience_id} readOnly />
    <input
      type="text"
      name="name"
      placeholder="Audience Name"
      value={audienceInfo.name}
      onChange={handleAudienceChange}
      className="border-['unset']"
    />
    {audienceInfo.name && <Button type="submit">SAVE</Button>}
  </Form>
);

export { AudienceForm };
