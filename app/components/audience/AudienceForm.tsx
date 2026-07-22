import { Form } from "react-router";
import { Button } from "@/components/ui/button";
import { FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AudienceFormProps {
  handleSaveAudience: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  audience_id: string | undefined;
  workspace_id: string | undefined;
  /** Controlled name owned by the page (keeps H1 in sync). */
  name: string;
  onNameChange: (name: string) => void;
}

const AudienceForm = ({
  handleSaveAudience,
  audience_id,
  workspace_id,
  name,
  onNameChange,
}: AudienceFormProps) => {
  const handleSave = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    handleSaveAudience(e);
  };

  return (
    <Form action="/api/audiences" method="PATCH" onSubmit={handleSave} className="py-4">
      <input name="id" hidden value={audience_id} readOnly />
      <input name="workspace" hidden value={workspace_id} readOnly />
      <Label htmlFor="name" className="text-foreground">
        Call list name
      </Label>
      <div className="flex gap-2">
        <Input
          id="name"
          type="text"
          name="name"
          placeholder="Call list name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="text-foreground"
        />
        <Button type="submit" disabled={name.trim().length === 0}>
          Save
        </Button>
      </div>
    </Form>
  );
};

export { AudienceForm };
