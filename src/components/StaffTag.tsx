import { ShieldCheck } from "lucide-react";
import { isStaff, useStaffIds } from "@/lib/staff";
import { EquippedProfileTag } from "./ProfileTags";

/** Small staff chip shown next to the names of admin users. */
export function StaffTag({ userId, className }: { userId?: string | null; className?: string }) {
  const { data: staffIds } = useStaffIds();
  return (
    <span className={`inline-flex max-w-full flex-wrap items-center gap-1 ${className ?? ""}`}>
    <EquippedProfileTag userId={userId} />
    {isStaff(staffIds, userId) &&
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/40 bg-primary/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-primary ${className ?? ""}`}
    >
      <ShieldCheck className="h-2.5 w-2.5" aria-hidden />
      Staff
    </span>}
    </span>
  );
}
