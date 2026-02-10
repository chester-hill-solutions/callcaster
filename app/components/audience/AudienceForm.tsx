import { Form } from "@remix-run/react";
import { Button } from "@/components/ui/button";
import { FormEvent, useState } from "react";
import { Database } from "@/lib/database.types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
interface AudienceFormProps {
  audienceInfo: Database["public"]["Tables"]["audience"]["Row"] | null;
  handleSaveAudience: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  audience_id: string | undefined;
  workspace_id: string | undefined;
}

const AudienceForm = ({
  audienceInfo,
  handleSaveAudience,
  audience_id,
  workspace_id
}: AudienceFormProps) => {
  const [, setError] = useState<string | null>(null);
  const [name, setName] = useState<string>(audienceInfo?.name || "");
  const handleSave = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    handleSaveAudience(e);
    setError(null);
  };
  return (
    <Form action="/api/audiences" method="PATCH" onSubmit={handleSave} className="py-4">
      <input name="id" hidden value={audience_id} readOnly />
      <input name="workspace" hidden value={workspace_id} readOnly />
      <Label htmlFor="name" className="text-muted-foreground">Audience Name</Label>
      <div className="flex gap-2">
        <Input
          type="text"
          name="name"
          placeholder="Audience Name"
          value={name}
          onChange={(e) => {
            const value = e.target.value;
            if (value.length > 0) {
              setError(null);
            }
            setName(value);
          }}
          className="text-muted-foreground"
        />
        <Button type="submit" disabled={name.length === 0}>SAVE</Button>
      </div>
    </Form>
  )
};

export { AudienceForm };
