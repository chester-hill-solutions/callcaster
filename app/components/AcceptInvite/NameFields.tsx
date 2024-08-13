import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

export function NameFields() {
  return (
    <div className="flex w-full gap-4">
      <Label htmlFor="firstName" className="flex w-full flex-col">
        First Name
        <Input type="text" name="firstName" id="firstName" required />
      </Label>
      <Label htmlFor="lastName" className="flex w-full flex-col">
        Last Name
        <Input type="text" name="lastName" id="lastName" required />
      </Label>
    </div>
  );
}
