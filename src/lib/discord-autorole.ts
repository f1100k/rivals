// Pure helpers: who still needs the Membro role.
export const MEMBER_ROLE_ID = "1567375475305611325"; // Membro

export interface GuildMember {
  user?: { id: string; bot?: boolean };
  roles?: string[];
  pending?: boolean;
}

/** A person (not a bot, not pending) who does not have the role yet. */
export function memberNeedsRole(member: GuildMember, roleId = MEMBER_ROLE_ID): boolean {
  if (!member.user || member.user.bot || member.pending) return false;
  return !(member.roles ?? []).includes(roleId);
}

export function membersMissingRole(members: GuildMember[], roleId = MEMBER_ROLE_ID): string[] {
  return members.filter((m) => memberNeedsRole(m, roleId)).map((m) => m.user!.id);
}
