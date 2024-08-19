import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

export function PasswordFields() {
  return (
    <>
      <Label htmlFor="password" className="flex w-full flex-col">
        Password
        <Input type="password" name="password" id="password" required />
      </Label>
      <Label htmlFor="confirmPassword" className="flex w-full flex-col">
        Confirm Password
        <Input type="password" name="confirmPassword" id="confirmPassword" required />
      </Label>
    </>
  );
}
