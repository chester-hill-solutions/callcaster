import { Button } from "~/components/ui/button";
import { GrUserSettings } from "react-icons/gr";
import { clsx } from "clsx";
import { useTheme } from "next-themes";

export enum MemberRole {
  Owner = "owner",
  Member = "member",
  Caller = "caller",
}

type TeamMemberProps = {
  memberName: string;
  memberRole: MemberRole;
};

export default function TeamMember({
  memberName,
  memberRole,
}: TeamMemberProps) {
  const iconStyles = clsx(
    "aspect-square w-8 rounded-full",
    memberRole === MemberRole.Owner && "bg-green-500",
    memberRole === MemberRole.Member && "bg-cyan-500",
    memberRole === MemberRole.Caller && "bg-rose-500",
  );
  const roleTextStyles = clsx(
    "font-Zilla-Slab font-semibold italic",
    memberRole === MemberRole.Owner && "text-green-500",
    memberRole === MemberRole.Member && "text-cyan-500",
    memberRole === MemberRole.Caller && "text-rose-500",
  );

  const { theme } = useTheme();
  return (
    <div className="flex w-full justify-between rounded-md border-2 border-black bg-transparent p-2 text-xl shadow-sm dark:border-white">
      <div className="flex items-center gap-2">
        <div className={iconStyles} />
        <p className="font-semibold">{memberName}</p>
      </div>
      <div className="flex items-center gap-2">
        <p className={roleTextStyles}>{memberRole}</p>
        <Button className="h-fit rounded-full bg-transparent p-2">
          {theme === "dark" ? (
            <GrUserSettings
              size="16px"
              className="mx-auto aspect-square w-fit"
              color="white"
            />
          ) : (
            <GrUserSettings
              size="16px"
              className="mx-auto aspect-square w-fit"
              color="black"
            />
          )}
        </Button>
      </div>
    </div>
  );
}
