import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getStaffIds } from "./staff.functions";

/** Admin user ids, fetched once and shared by every StaffTag on screen. */
/** True when the user appears in the admin id list (StaffTag rule). */
export function isStaff(staffIds: string[] | undefined, userId?: string | null) {
  return Boolean(userId && staffIds?.includes(userId));
}

export function useStaffIds() {
  const fn = useServerFn(getStaffIds);
  return useQuery({ queryKey: ["staff-ids"], queryFn: () => fn(), staleTime: 300_000, retry: 1 });
}
