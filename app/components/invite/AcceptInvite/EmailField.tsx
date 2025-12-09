import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

interface EmailFieldProps {
  email: string;
}

export function EmailField({ email }: EmailFieldProps) {
  return (
    <Label htmlFor="email" className="flex w-full flex-col">
      Email
      <Input type="email" name="email" id="email" value={email} readOnly required />
    </Label>
  );
}
