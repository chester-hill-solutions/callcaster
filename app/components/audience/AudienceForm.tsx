import { Form } from "react-router";
import { Button } from "@/components/ui/button";
import { FormEvent, useEffect, useState } from "react";
import type { Database } from "@/lib/db-types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AudienceFormProps {
  audienceInfo: Database["public"]["Tables"]["audience"]["Row"] | null;
  handleSaveAudience: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  audience_id: string | undefined;
  workspace_id: string | undefined;
  /** Keeps the parent page title in sync while the user edits (#1080). */
  onNameChange?: (name: string) => void;
}

const AudienceForm = ({
  audienceInfo,
  handleSaveAudience,
  audience_id,
  workspace_id,
  onNameChange,
}: AudienceFormProps) => {
  const [, setError] = useState<string | null>(null);
  const [name, setName] = useState<string>(audienceInfo?.name || "");

  /**
   * @effect Reset local name when the loader / save response replaces audienceInfo.
   * @effect-deps audienceInfo?.name from parent
   * @effect-side-effects setName
   * @effect-why-not-loader Controlled form state must rehydrate after PATCH / revalidate.
   */
  useEffect(() => {
    setName(audienceInfo?.name || "");
  }, [audienceInfo?.name]);

  const handleSave = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    handleSaveAudience(e);
    setError(null);
  };

  return (
    <Form action="/api/audiences" method="PATCH" onSubmit={handleSave} className="py-4">
      <input name="id" hidden value={audience_id} readOnly />
      <input name="workspace" hidden value={workspace_id} readOnly />
      <Label htmlFor="name" className="text-foreground">
        Audience Name
      </Label>
      <div className="flex gap-2">
        <Input
          id="name"
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
            onNameChange?.(value);
          }}
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
