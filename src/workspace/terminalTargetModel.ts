import type { ConnectionProfile, ProfileGroup } from "../lib/tauri/profiles";

/** Derive picker lists without owning connection selection or native sessions. */
export function recentTargetProfiles(profiles: ConnectionProfile[], ids: string[]) {
  return ids.map(id => profiles.find(profile => profile.id === id))
    .filter((profile): profile is ConnectionProfile => Boolean(profile)).slice(0, 6);
}

export function groupTargetProfiles(profiles: ConnectionProfile[], groups: ProfileGroup[]) {
  const knownIds = new Set(groups.map(group => group.id));
  const grouped = groups.map(group => ({ id: group.id, name: group.name,
    profiles: profiles.filter(profile => profile.groupId === group.id) }));
  const ungrouped = profiles.filter(profile => !profile.groupId || !knownIds.has(profile.groupId));
  return [...grouped.filter(group => group.profiles.length > 0),
    ...(ungrouped.length ? [{ id: "__ungrouped__", name: "未分组", profiles: ungrouped }] : [])];
}

export function searchTargetProfiles(profiles: ConnectionProfile[], query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  return normalized ? profiles.filter(profile => `${profile.name}\n${profile.host}\n${profile.username}`.toLocaleLowerCase().includes(normalized)) : [];
}
